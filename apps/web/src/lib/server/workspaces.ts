import { questionLabel } from '#lib/question-label.ts';
import { promptTitle } from '#lib/prompt-title.ts';
import { problemOf } from '#lib/problem.ts';
import { isInactive } from '#lib/family.ts';
import { createAgentAccess, isExternal } from './agent-access.ts';
import { createPreferences } from './preferences.ts';
import { createImages } from './images.ts';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import {
	AGENTS,
	BRANCH_NAME,
	MODEL_SETTING,
	SETTING,
	sameAgentSettings,
	type Agent,
	type AgentEvent,
	type AgentSettings,
	type Question,
	type ContextUsage,
	type ForgeMessage,
	type Harness,
	type WorktreeMode,
	type WorktreeRef,
	type ProjectRef
} from '@geordi/protocol';
import type { EventStore, GeordiEvent } from './events/index.ts';
import {
	createWorkspaceProjection,
	questionById,
	toolById,
	type ActionId,
	type PendingMessage,
	type Status,
	type TranscriptEdit,
	type TranscriptFollower,
	type TranscriptUpdate,
	type Workspace
} from './workspace-projection.ts';
import { instructionsFor } from './instructions.ts';
import type { createRepos } from './repos.ts';
import { pageOf, turnBlobIndex, turnsOf } from './turns.ts';

export type {
	SubagentItem,
	TranscriptEdit,
	TranscriptFollower,
	TranscriptItem,
	TranscriptUpdate,
	Workspace,
	WorkspacesEvent
} from './workspace-projection.ts';

export type WorkspaceSummary = Omit<Workspace, 'transcript' | 'pendingMessages'> & {
	pendingDelivery?: boolean;
};

/** What an agent sees of an agent it started (FDR-002). */
export type AgentReport = {
	parentQuestions?: { id: string; questions: Question[] }[];
	/** Other direct children with a decision for the caller of wait_for_agent. */
	childrenAsking?: string[];
	id: string;
	parentId: string | null;
	agent: Agent;
	title: string;
	status: Status;
	/** The branch the agent works on, once its worktree exists. */
	branch: string | null;
	/** Whether it works in the same directory as the agent that started it. */
	sharesWorktree: boolean;
	/** The agent's latest message in its latest turn: its answer, once the turn is over. */
	reply: string;
	error: string | null;
};

/** Guards against runaway delegation (FDR-002). */
export type Limits = {
	/** How many agents deep a chain of agents starting agents may get. */
	depth: number;
	/** How many agents one agent may have running at once. */
	children: number;
};

/** Sends a message to a daemon; returns false if none is connected. */
export type Dispatch = (message: ForgeMessage) => boolean;

/** What a workspace is called until it is told what to do, or named. */
export const UNTITLED = 'New workspace';

/** How often an agent may name its own workspace. */
export const MAX_NAMES = 3;
/** How much of an agent's reply its parent is told when its turn ends; the rest is read. */
const MAX_NOTICE = 4000;

type NewWorkspace = {
	/** `null` for a project (FDR-012). */
	repoId: string | null;
	agent: Agent;
	settings?: AgentSettings;
	prompt: string;
	images?: string[];
};

export function createWorkspaces(
	store: EventStore<GeordiEvent>,
	repos: ReturnType<typeof createRepos>,
	dispatch: Dispatch,
	{
		limits = { depth: 3, children: 5 },
		secret = randomBytes(32).toString('base64url')
	}: {
		limits?: Limits;
		/** Signs agent API tokens. Must be the same after a restart, or running agents lose access. */
		secret?: string;
	} = {}
) {
	const access = createAgentAccess(store, repos.get);
	const preferences = createPreferences(store);
	const imageStore = createImages(store);
	const projection = createWorkspaceProjection(store);
	const { transcriptOf } = projection;
	// All visible files of a review share this lookup, including while its legacy patch parses.
	let review: { id: string; turn: number; files: ReturnType<typeof turnBlobIndex> } | undefined;

	function find(id: string): Workspace {
		const workspace = projection.get().get(id);
		if (!workspace) error(404, `Workspace ${id} not found`);
		return workspace;
	}

	/**
	 * How full each working agent's context is, as it said since its turn began: it says so
	 * after every step, too often for the event log. Recorded when the turn ends (`keepUsage`);
	 * after a restart, the daemon says it again.
	 */
	const usages = new Map<string, ContextUsage>();
	const usageListeners = new Set<(id: string) => void>();
	const sameUsage = (a: ContextUsage | null, b: ContextUsage) =>
		a?.used === b.used &&
		a.size === b.size &&
		a.cost?.amount === b.cost?.amount &&
		a.cost?.currency === b.cost?.currency;
	function keepUsage(workspace: Workspace, usage: ContextUsage) {
		usages.delete(workspace.id);
		if (sameUsage(workspace.usage, usage)) return;
		const { id } = workspace;
		store.append({ type: 'workspace.usage', stream: `workspace:${id}`, data: { id, usage } });
	}

	const summarise = ({
		transcript,
		pendingMessages,
		...workspace
	}: Workspace): WorkspaceSummary => {
		void transcript;

		return structuredClone({
			...workspace,
			...(pendingMessages?.length && { pendingDelivery: true }),
			usage: usages.get(workspace.id) ?? workspace.usage,
			worktree: projection.get().get(workspace.worktreeId)?.worktree ?? null
		});
	};
	const view = (workspace: Workspace): Workspace => ({
		...summarise(workspace),
		transcript: structuredClone(transcriptOf(workspace))
	});

	// Each follower owns only the edits since its last read. Replaced items are immutable.
	function followTranscript(id: string): TranscriptFollower {
		let edits: TranscriptEdit[] | undefined;
		const receive = (edit: TranscriptEdit) => edits?.push(edit);
		const stop = projection.followEdits(id, receive);
		return {
			read(): TranscriptUpdate {
				const previous = edits;
				edits = [];
				return previous ? { edits: previous } : transcriptOf(find(id)).slice();
			},
			close: stop
		};
	}

	/** Where a workspace's agent works: its worktree, or a project's folder (FDR-012). */
	function locate(id: string): WorktreeRef | ProjectRef {
		const { repoId, worktreeId } = find(id);
		return repoId === null ? { worktreeId, project: true } : ref(id);
	}

	/** What a daemon needs to find the worktree a workspace works in. A project has none. */
	function ref(id: string): WorktreeRef {
		const { repoId, worktreeId } = find(id);
		if (repoId === null) error(409, 'A project has no worktree');
		// the worktree's base is its owner's: a workspace may work in another's worktree
		const owner = find(worktreeId);
		const branch = owner.worktree?.branch;
		return {
			worktreeId,
			repoPath: repos.get(repoId).path,
			...(owner.worktreeParent && { worktreeParent: owner.worktreeParent }),
			...(owner.base && { base: owner.base }),
			...(branch && { branch })
		};
	}

	/**
	 * Records daemon output for a workspace. Unknown workspaces are ignored. When a turn
	 * completes, the next waiting message goes out. After a failed or stopped turn, waiting
	 * messages stay put: sending more into a conversation that just broke would be a guess.
	 *
	 * Turns are the agent's to begin and end (ADR-010): it says when it starts working, which
	 * it may do unasked, and when it has finished. What it says while it is not at work, as
	 * far as we know, is dropped: a daemon may say things twice, or late (after we gave a
	 * turn up while it was away), and the end of a turn that is over must not end the next.
	 */
	function record(id: string, event: AgentEvent, cursor?: string) {
		const workspace = projection.get().get(id);
		if (!workspace || workspace.archivedAt) return;
		if (cursor && workspace.outputCursor === cursor) return;
		// what the agent calls its session may come at any time, even after its turn
		if (event.kind === 'title') return titleFromAgent(workspace, event.title);
		if (event.kind === 'worktree') {
			const known = projection.get().get(workspace.worktreeId)?.worktree;
			if (known?.path === event.path && known.branch === event.branch) return;
		}
		const running = workspace.status === 'running';
		// how to resume it is news at any time, and so is where its worktree is
		if (event.kind === 'resume') {
			if (event.id === workspace.resumeId) return;
		} else if (event.kind === 'turn.started') {
			if (running) return;
		} else if (!running && (event.kind === 'tool.result' || event.kind === 'tool.update')) {
			// A background command can finish after its turn (its input held until then, see
			// `ToolInfos`). Complete its existing entry once.
			if (toolById(workspace, event.id)?.output !== null) return;
		} else if (
			event.kind !== 'subagent' &&
			event.kind !== 'worktree' &&
			event.kind !== 'message.received' &&
			event.kind !== 'answer.received' &&
			!running
		)
			return;
		const parent =
			event.kind === 'question' && event.blocking !== false && workspace.parentId
				? projection.get().get(workspace.parentId)
				: undefined;
		const toParent =
			parent && !parent.archivedAt && !held.has(parent.id) && onParentTask(workspace);
		const newRequest = toParent && event.kind === 'question' && !questionById(workspace, event.id);
		store.append({
			type: 'workspace.output',
			stream: `workspace:${id}`,
			data: { id, event, ...(toParent && { toParent: true as const }), ...(cursor && { cursor }) }
		});
		if (newRequest && parent) {
			const waits = [...waiting.values()].flatMap((group) =>
				[...group].filter((wait) => wait.callerId === parent.id)
			);
			if (waits.length) {
				for (const wait of waits) wait.finish();
			} else notifyQuestion(parent);
		}
		const measured = usages.get(id);
		if (measured && workspace.status === 'idle') keepUsage(workspace, measured);
		if (event.kind === 'turn.completed' || event.kind === 'turn.failed') {
			// Capture the result while the completed turn is still the latest one.
			const waits = waiting.get(id);
			const parentWaiting =
				waits && [...waits].some((wait) => wait.callerId === workspace.parentId);
			if (waits) {
				const result = report(workspace);
				for (const wait of waits) wait.finish(result);
			}
			if (!parentWaiting) tellParent(workspace);
			if (event.kind === 'turn.completed') {
				if (archiving.has(id)) deferredCompletions.add(id);
				else {
					promoteCompletedQueue(workspace);
					notifyQuestion(workspace);
				}
			}
		}
	}

	type Wait = { callerId: string; finish(result?: AgentReport): void };
	const waiting = new Map<string, Set<Wait>>();

	function onParentTask(child: Workspace, turn = latestTurn(child)) {
		if (turn.some((item) => item.kind === 'user' && !item.from)) return false;
		const from = turn.find((item) => item.kind === 'user')?.from;
		return !!from && (from === child.parentId || projection.get().get(from)?.parentId === child.id);
	}

	/**
	 * Tells an agent's parent that it has finished a turn, with what it said (FDR-002), unless
	 * the parent is waiting for it already.
	 * Only of turns on the parent's behalf: begun by the parent, or by what one of the agent's
	 * own agents reported, so that news goes up a chain. A person's talk with it is theirs.
	 */
	function tellParent(child: Workspace) {
		if (child.status !== 'idle' || !child.parentId) return;
		const parent = projection.get().get(child.parentId);
		if (!parent || parent.archivedAt) return;
		const turn = latestTurn(child);
		if (!onParentTask(child, turn)) return;
		const { reply, error } = report(child, turn);
		const text = [
			error
				? `Your agent “${child.title}” (${child.id}) stopped: ${error}`
				: `Your agent “${child.title}” (${child.id}) finished its turn.`,
			// an answer ends with its conclusion, so a long one loses its start
			reply.length > MAX_NOTICE
				? `(Its reply begins earlier; see read_workspace.)\n\n…${reply.slice(-MAX_NOTICE)}`
				: reply
		]
			.filter(Boolean)
			.join('\n\n');
		// Keep the exact report: a background result can start another turn during teardown.
		if (archiving.has(child.id) || held.has(parent.id)) {
			deferredReports.add({ child, parent, text });
			return;
		}
		deliverReport(child, parent, text);
	}

	const deferredReports = new Set<{ child: Workspace; parent: Workspace; text: string }>();

	function deliverReport(child: Workspace, parent: Workspace, text: string) {
		// after a failed turn, a parent's waiting messages stay put (see `record`), and so does this
		if (parent.status === 'running' || parent.queue.length === 0)
			return say(parent, text, child.id);
		store.append(
			{ type: 'workspace.queued', stream: `workspace:${parent.id}`, data: { id: parent.id, text } },
			{ actor: child.id }
		);
	}

	/**
	 * The agent API token of a workspace. Tokens are derived, not stored: one is valid while
	 * the workspace's agent is at work, which the event log knows. So agents keep their
	 * access across a restart of the forge. It is the same for as long as the workspace
	 * lives: its agent's CLI runs across turns, and is handed it once, when it starts.
	 */
	function tokenFor(workspace: Workspace): string {
		return `${workspace.id}.${createHmac('sha256', secret).update(workspace.id).digest('base64url')}`;
	}

	/** The workspace a valid agent API token belongs to, or `null`. */
	function authenticate(token: string): string | null {
		if (isExternal(token)) return access.authenticate(token);
		const workspace = projection.get().get(token.split('.')[0]);
		if (workspace?.status !== 'running') return null;
		const expected = Buffer.from(tokenFor(workspace));
		const given = Buffer.from(token);
		return given.length === expected.length && timingSafeEqual(given, expected)
			? workspace.id
			: null;
	}

	/** Workspaces that must not start a turn right now, and what is being done to them; see `hold`. */
	const held = new Map<string, string>();
	const archiving = new Set<string>();
	const deferredCompletions = new Set<string>();
	function refuseHeld(id: string) {
		const doing = held.get(id);
		if (doing) error(409, `This workspace is ${doing}`);
	}

	/** Send the recorded prompt. An unacknowledged delivery is retried on reconnect. */
	function deliver(workspace: Workspace, message: PendingMessage, working: boolean) {
		const { text, images, deliveryId } = message;
		let target: WorktreeRef | ProjectRef;
		let attachments;
		try {
			target = locate(workspace.id);
			attachments = images.map(imageStore.get);
		} catch (error) {
			const reason =
				'Could not deliver the prompt. ' +
				problemOf(error, 'Check its repository and attached images.');
			console.error(`[workspace ${workspace.id}] ${reason}`, error);
			if (!working && workspace.pendingMessages?.length === 1)
				record(workspace.id, { kind: 'turn.failed', error: reason });
			else
				store.append({
					type: 'workspace.undeliverable',
					stream: `workspace:${workspace.id}`,
					data: { id: workspace.id, deliveryId, reason }
				});
			return false;
		}
		return dispatch({
			type: 'agent.message',
			workspaceId: workspace.id,
			...target,
			agent: workspace.agent,
			settings: workspace.settings,
			apiToken: tokenFor(workspace),
			resumeId: workspace.resumeId,
			...(workspace.agent === 'claude' && preferences.get().identifyClaude && { identify: true }),
			instructions: instructionsFor({
				parent: (workspace.parentId && projection.get().get(workspace.parentId)) || null,
				project: workspace.repoId === null,
				sharesWorktree: workspace.worktreeId !== workspace.id,
				named: workspace.named,
				manuallyNamed: workspace.manuallyNamed,
				mayDelegate: depthOf(workspace) < limits.depth
			}),
			...(attachments.length && { images: attachments }),
			deliveryId,
			prompt: text
		});
	}

	function say(
		workspace: Workspace,
		text: string,
		actor: string | null,
		from?: 'queued',
		images: string[] = [],
		action?: ActionId,
		questionNotice?: { id: string; question: string }
	) {
		const { id } = workspace;
		if (workspace.agent === 'opencode' && workspace.status !== 'idle' && !from) {
			store.append(
				{
					type: 'workspace.queued',
					stream: `workspace:${id}`,
					data: { id, text, ...(images.length && { images }), ...(action && { action }) }
				},
				{ actor }
			);
			return;
		}
		const sender = from === 'queued' ? workspace.sentBy.queue[0] : actor;
		const senderName = sender
			? (access.name(sender) ?? projection.get().get(sender)?.title)
			: undefined;
		if (from === 'queued') images = workspace.attachments.queue[0];
		const deliveryId = randomUUID();
		const working = workspace.status === 'running';
		const message: GeordiEvent = {
			type: 'workspace.message',
			stream: `workspace:${id}`,
			data: {
				id,
				text,
				deliveryId,
				...(action && { action }),
				...(images.length && { images }),
				...(from && { [from]: true }),
				...(senderName && { senderName })
			}
		};
		store.append(
			questionNotice
				? [
						message,
						{
							type: 'workspace.questionNotified',
							stream: `workspace:${questionNotice.id}`,
							data: questionNotice
						}
					]
				: message,
			{ actor }
		);
		// append applies the projection synchronously, including the briefing and attachments.
		const pending = workspace.pendingMessages?.find((message) => message.deliveryId === deliveryId);
		if (pending) deliver(workspace, pending, working);
	}

	function promoteCompletedQueue(workspace: Workspace) {
		if (
			workspace.lastTurn === 'completed' &&
			workspace.queue.length &&
			!archiving.has(workspace.id)
		)
			say(workspace, workspace.queue[0], null, 'queued');
	}

	/**
	 * What an agent started by another runs with: what it inherits, but for what was asked
	 * for. An inherited effort goes with a new model only if that model offers it; an effort
	 * asked for must be one the model offers (when known: a model not on offer can still be
	 * named, as in the UI).
	 */
	function settingsFor(
		agent: Agent,
		parent: Workspace | null,
		asked: AgentSettings,
		harness: Harness | undefined
	): AgentSettings {
		// Model names and effort levels belong to a provider. Permission modes span providers.
		const inherited = parent && agent === parent.agent ? parent.settings : {};
		const model = asked.model ?? inherited.model;
		const efforts = harness
			? (harness.models.find((offer) => offer.id === model)?.efforts ?? harness.efforts)
			: null;
		if (asked.effort && efforts && !efforts.includes(asked.effort))
			error(
				400,
				efforts.length > 0
					? `${model ? `${model} (${agent})` : agent} offers no effort ${asked.effort}; it offers ${efforts.join(', ')}`
					: `${model ? `${model} (${agent})` : agent} offers no choice of effort`
			);
		const keeps = !asked.model || !efforts || efforts.includes(inherited.effort ?? '');
		const effort = asked.effort ?? (keeps ? inherited.effort : undefined);
		return { model, effort, permissionMode: parent?.settings.permissionMode };
	}

	/** Only what was chosen, and only what can safely be handed to a CLI. */
	function chosenOf(settings: AgentSettings): AgentSettings {
		const chosen: AgentSettings = {};
		for (const key of ['model', 'effort'] as const) {
			const value = settings[key];
			if (!value) continue;
			if (!(key === 'model' ? MODEL_SETTING : SETTING).test(value))
				error(400, `That is not a ${key}: ${value}`);
			chosen[key] = value;
		}
		if (settings.permissionMode) chosen.permissionMode = settings.permissionMode;
		return chosen;
	}

	/**
	 * Gives the workspace a new title. Whatever is passed is cut down to one modest line;
	 * if nothing is left of it, the title stays.
	 */
	function retitle(id: string, title: string, actor: string | null = null) {
		const clean = title
			.split('\n')[0]
			.trim()
			.replace(/^["'“‘]+|["'”’.]+$/g, '')
			.slice(0, 80)
			.trim();
		if (!clean || clean === find(id).title) return;
		store.append(
			{ type: 'workspace.titled', stream: `workspace:${id}`, data: { id, title: clean } },
			{ actor }
		);
	}

	/**
	 * Names a workspace that was started without a word after the first thing it is told, as
	 * one started with a prompt is: its first line.
	 */
	function nameAfter(workspace: Workspace, text: string) {
		if (workspace.named || workspace.transcript.length > 0 || workspace.title !== UNTITLED) return;
		const title = promptTitle(text);
		if (title && title !== UNTITLED)
			store.append({
				type: 'workspace.titled',
				stream: `workspace:${workspace.id}`,
				data: { id: workspace.id, title }
			});
	}

	/**
	 * The title the agent gives its session (FDR-001). It names the workspace until someone
	 * names it on purpose, a person or the agent itself (`name_workspace`). A later one
	 * replaces it: agents title a session once, and again only when it is renamed. A
	 * title that merely repeats the start of something the agent was told is none: Codex
	 * says the prompt back until it has made one, and Claude does where it could not.
	 */
	function titleFromAgent(workspace: Workspace, title: string) {
		if (workspace.named) return;
		const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
		const said = flat(title).replace(/…$/, '').trimEnd();
		const echo = workspace.transcript.some(
			(item) => item.kind === 'user' && flat(item.text).startsWith(said)
		);
		if (!echo) retitle(workspace.id, title);
	}

	/**
	 * Creates a workspace and sends `prompt` to its agent, if there is one: without, the
	 * workspace is there to be told what to do. Returns the workspace's ID.
	 */
	function create(
		{
			prompt,
			images = [],
			settings = {},
			title: given,
			...workspace
		}: NewWorkspace & { parentId?: string; worktreeId?: string; base?: string; title?: string },
		actor: string | null = null
	): string {
		imageStore.resolve(images);
		if (workspace.base !== undefined) refuseBranch(workspace.base);
		// an agent must not start in a worktree on its way out, or on the move
		if (workspace.worktreeId) refuseHeld(workspace.worktreeId);
		const { repoId, ...rest } = workspace;
		if (repoId !== null) {
			repos.get(repoId);
			refuseHeld(`repo:${repoId}`);
		}
		const chosen = chosenOf(settings);
		const id = randomUUID();
		const title = promptTitle(prompt) || UNTITLED;
		store.append(
			{
				type: 'workspace.created',
				stream: `workspace:${id}`,
				data: {
					id,
					title,
					...(repoId !== null && { repoId }),
					...(repoId !== null && !rest.worktreeId && { worktreeParent: repoId }),
					...rest,
					...(Object.keys(chosen).length > 0 && { settings: chosen })
				}
			},
			{ actor }
		);
		// whoever starts it may name it; otherwise its agent does (`titleFromAgent`, `name_workspace`)
		if (given && actor) retitle(id, given, actor);
		// started with nothing to do, it waits to be told: its first turn is its first message
		if (!prompt && !images.length) return id;
		say(find(id), prompt, actor, undefined, images);
		return id;
	}

	function refuseBranch(name: string) {
		if (!BRANCH_NAME.test(name)) error(400, `${name} is not a branch name`);
	}

	async function waitUntil(ready: () => boolean, timeoutMs: number) {
		if (!ready())
			await new Promise<void>((resolve) => {
				const done = () => {
					clearTimeout(timeout);
					unsubscribe();
					resolve();
				};
				const timeout = setTimeout(done, timeoutMs);
				const unsubscribe = store.subscribe(() => ready() && done());
			});
	}

	function stop(id: string) {
		if (find(id).status !== 'running') return;
		if (!dispatch({ type: 'agent.stop', workspaceId: id }))
			record(id, { kind: 'turn.failed', error: 'Stopped' });
	}

	// --- Agents starting agents (FDR-002) -------------------------------------------------

	/** How many agents started agents to get to this workspace; 0 if a person started it. */
	function depthOf(workspace: Workspace): number {
		const parent = workspace.parentId && projection.get().get(workspace.parentId);
		return parent ? depthOf(parent) + 1 : 0;
	}

	/**
	 * Whether the caller may see a repository's workspaces: an external client, those it was
	 * granted, and so may the agents it started (directly or not), or they would be its way
	 * around that.
	 */
	function reaches(callerId: string, repoId: string | null): boolean {
		const workspace = projection.get().get(callerId);
		const starter = workspace && starterOf(workspace);
		if (starter) return reaches(starter, repoId);
		// a token for chosen repositories doesn't reach a project, which is in none (FDR-012)
		return !isExternal(callerId) || (repoId !== null && access.reaches(callerId, repoId));
	}

	/**
	 * Whether the caller may see a workspace: one in a repository it reaches. A project's agents
	 * see no other project (FDR-012): only their own, and the agents working in it.
	 */
	function sees(callerId: string, workspace: Workspace): boolean {
		if (!reaches(callerId, workspace.repoId)) return false;
		const caller = projection.get().get(callerId);
		return (
			workspace.repoId !== null ||
			caller?.repoId !== null ||
			workspace.worktreeId === caller.worktreeId
		);
	}

	/** A workspace the caller may see. Any other doesn't exist for it. */
	function findFor(callerId: string, id: string): Workspace {
		const workspace = projection.get().get(id);
		if (!workspace || !sees(callerId, workspace)) error(404, `Workspace ${id} not found`);
		return workspace;
	}

	/** Who may supervise a workspace: the workspace or external client that started it. */
	const starterOf = (workspace: Workspace) => workspace.parentId ?? workspace.startedBy;

	/** The workspaces a workspace's agent (or an external client) started that are still in use. */
	const childrenOf = (id: string) =>
		[...projection.get().values()].filter(
			(workspace) => starterOf(workspace) === id && !workspace.archivedAt
		);

	/** Every workspace the caller started, directly or through the agents it started. */
	const descendantsOf = (id: string): Workspace[] =>
		childrenOf(id).flatMap((child) => [child, ...descendantsOf(child.id)]);

	/**
	 * Whether the caller is a project's agent (FDR-012): it acts for the person, and
	 * may do whatever they may.
	 */
	const isProject = (callerId: string) =>
		!isExternal(callerId) && projection.get().get(callerId)?.repoId === null;

	/**
	 * A workspace the caller started (directly or not). Anything else doesn't exist for it,
	 * unless the caller is a project, which may supervise any it sees: in a repository, or in
	 * the project itself. Never another project (FDR-012).
	 */
	function findControlled(callerId: string, id: string): Workspace {
		if (isProject(callerId)) return findFor(callerId, id);
		const workspace = descendantsOf(callerId).find((candidate) => candidate.id === id);
		if (!workspace) error(404, `You have not started an agent with ID ${id}`);
		return workspace;
	}

	/** Refuses to set another of a workspace's agents to work while too many already are. */
	function ensureCapacity(parentId: string) {
		const running = childrenOf(parentId).filter((child) => child.status === 'running');
		if (running.length >= limits.children)
			error(429, `${limits.children} agents are already running; wait for one to finish`);
	}

	// A waiting parent's tool returns the request. Otherwise the child can wait for the
	// parent's next free turn. Persist the wake-up with its receipt so a restart can retry it.
	function notifyQuestion(parent: Workspace) {
		if (
			parent.status !== 'idle' ||
			parent.archivedAt ||
			parent.queue.length ||
			held.has(parent.id) ||
			archiving.has(parent.id)
		)
			return;
		for (const child of childrenOf(parent.id)) {
			if (child.status !== 'running') continue;
			const asked = child.transcript.find(
				(item) =>
					item.kind === 'question' && item.open && item.route === 'parent' && !item.parentNotified
			);
			if (asked?.kind !== 'question') continue;
			say(parent, 'A child workspace needs your decision.', child.id, undefined, [], undefined, {
				id: child.id,
				question: asked.id
			});
			return;
		}
	}

	function routedQuestions(workspace: Workspace, route: 'parent' | 'forwarded') {
		return workspace.transcript.flatMap((item) =>
			item.kind === 'question' && item.open && item.route === route
				? [{ id: item.id, questions: item.questions }]
				: []
		);
	}

	function childQuestion(caller: string, id: string, question: string) {
		const child = findFor(caller, id);
		if (child.archivedAt || child.parentId !== caller)
			error(403, 'Only the direct parent can handle this request');
		const asked = questionById(child, question);
		if (!asked?.route) error(409, 'This question was not addressed to the parent');
		return asked;
	}

	function latestTurn(workspace: Workspace) {
		const transcript = transcriptOf(workspace);
		// A completed turn has its own closing marker. Search before it for the previous turn.
		let end = transcript.length;
		if (workspace.status === 'idle' && transcript[end - 1]?.kind === 'turn') end--;
		let start = end;
		while (start > 0 && transcript[start - 1].kind !== 'turn') start--;
		return transcript.slice(start, end);
	}

	function report(workspace: Workspace, turn = latestTurn(workspace)): AgentReport {
		const parentQuestions = routedQuestions(workspace, 'parent');
		return {
			id: workspace.id,
			parentId: workspace.parentId,
			...(parentQuestions.length && { parentQuestions }),
			agent: workspace.agent,
			title: workspace.title,
			status: workspace.status,
			branch: projection.get().get(workspace.worktreeId)?.worktree?.branch ?? null,
			sharesWorktree: workspace.worktreeId !== workspace.id,
			// what it said on the way there is in the transcript, for read_workspace
			reply: turn.findLast((item) => item.kind === 'text')?.text ?? '',
			error: turn.findLast((item) => item.kind === 'error')?.error ?? null
		};
	}

	function entry(workspace: Workspace) {
		const { id, title, repoId, status, archivedAt, asking } = workspace;
		return {
			id,
			title,
			repoId,
			status,
			archivedAt,
			asking,
			// a person put it aside for later, or the one that started it
			inactive: isInactive(projection.get(), id),
			branch: projection.get().get(workspace.worktreeId)?.worktree?.branch ?? null,
			url: `/workspaces/${id}`
		};
	}

	/**
	 * Answers a question the workspace's agent asked, which it waits to hear about: one
	 * answer per question, in their order.
	 */
	function answer(id: string, question: string, answers: string[], actor: string | null = null) {
		const asked = questionById(find(id), question);
		const saved = asked?.answers;
		if (
			saved &&
			asked.delivery !== 'unconfirmed' &&
			answers.length === saved.length &&
			answers.every((value, i) => value === saved[i])
		)
			return;
		if (!asked?.open) error(409, 'That question no longer waits for an answer');
		if (
			answers.length !== asked.questions.length ||
			asked.questions.some((q, i) => !q.optional && !answers[i].trim())
		)
			error(400, 'Give an answer for each required question');
		if (asked.blocking === false && !answers.some((value) => value.trim()))
			error(400, 'Give at least one answer');
		store.append(
			{
				type: 'workspace.answered',
				stream: `workspace:${id}`,
				data: { id, question, answers, pending: true }
			},
			{ actor }
		);
		dispatch({ type: 'agent.answer', workspaceId: id, questionId: question, answers });
	}

	/**
	 * What agents can do through the agent API (ADR-004, FDR-002). Every function takes the
	 * caller: a workspace, or an external client's grant. It is recorded as the actor of what
	 * it causes. A workspace's agent can read any workspace, an external client those in the
	 * repositories it was granted; supervising (interrupting, stopping, archiving)
	 * is for whoever started it, directly or not.
	 */
	const agents = {
		limits,
		authenticate,
		isProject,
		reportWorkspace: (callerId: string, id: string) => report(findFor(callerId, id)),
		listRepositories: (callerId: string) =>
			repos
				.list()
				.filter((repo) => reaches(callerId, repo.id))
				.map(({ id, name, path }) => ({ id, name, path })),
		listWorkspaces(callerId: string, archived: boolean) {
			return [...projection.get().values()]
				.reverse()
				.filter((w) => (archived || !w.archivedAt) && sees(callerId, w))
				.map(entry);
		},
		answerQuestion(caller: string, id: string, question: string, answers: string[]) {
			const asked = childQuestion(caller, id, question);
			if (asked.route !== 'parent') error(409, 'This question was passed to the person');
			const values = answers.map((value, index) => {
				const field = asked.questions[index];
				if (!field?.options.length || asked.answers?.[index] === value) return value;
				const picks = field.multiSelect ? value.split('\n') : [value];
				const labels = picks.map((pick) => {
					if (field.options.some((option) => option.label === pick)) return pick;
					const matches = field.options.filter((option) => questionLabel(option.label) === pick);
					return matches.length === 1 ? matches[0].label : undefined;
				});
				return labels.every((label) => label !== undefined) ? labels.join('\n') : value;
			});
			answer(id, question, values, caller);
		},
		forwardQuestion(caller: string, id: string, question: string) {
			const asked = childQuestion(caller, id, question);
			if (!asked.open) error(409, 'This question is closed');
			if (asked.route === 'forwarded') return;
			store.append(
				{ type: 'workspace.questionForwarded', stream: `workspace:${id}`, data: { id, question } },
				{ actor: caller }
			);
		},
		readWorkspace(callerId: string, id: string, before?: number) {
			const workspace = findFor(callerId, id);
			const transcript = transcriptOf(workspace);
			return {
				...entry(workspace),
				...pageOf(turnsOf(transcript), before),
				pendingQuestions: transcript.filter((item) => item.kind === 'question' && item.open)
			};
		},

		/**
		 * Names the caller's own workspace, so that people can tell it from the others. A few
		 * times at most: a name that keeps changing is no name.
		 */
		name(callerId: string, title: string) {
			if (find(callerId).manuallyNamed) error(409, 'The person chose this workspace name.');
			const mine = store
				.readStream(`workspace:${callerId}`)
				.filter((event) => event.type === 'workspace.titled' && event.actor === callerId);
			if (mine.length >= MAX_NAMES)
				error(429, `You have named this workspace ${MAX_NAMES} times already; it keeps its name`);
			retitle(callerId, title, callerId);
			return { title: find(callerId).title };
		},

		/**
		 * Starts an agent on the caller's behalf, as a workspace of its own: in a new worktree
		 * (`own`), branched from `base` or else from the repository's base, or in the caller's
		 * worktree (`shared`). An
		 * agent of the caller's kind runs as the caller does, but for the `model` and `effort`
		 * asked for. An effort is checked against what is `offered`, when that is known.
		 */
		start(
			callerId: string,
			{
				repository,
				worktree,
				base,
				workspace: alongside,
				agent,
				model,
				effort,
				prompt,
				title
			}: {
				repository?: string;
				worktree: WorktreeMode;
				/** The branch a new worktree starts from, and is compared with; the repository's base if absent. */
				base?: string;
				/** An existing workspace where the caller may start an agent alongside its agent. */
				workspace?: string;
				agent?: Agent;
				model?: string;
				effort?: string;
				prompt: string;
				title?: string;
			},
			offered: Harness[] | null = null
		): AgentReport {
			const external = isExternal(callerId);
			const caller = external ? null : find(callerId);
			if (caller) refuseHeld(caller.id);
			if (caller && depthOf(caller) + 1 > limits.depth)
				error(403, `Agents can only be nested ${limits.depth} deep`);
			ensureCapacity(callerId);

			let where: Pick<Workspace, 'repoId'> & {
				parentId?: string;
				worktreeId?: string;
				base?: string;
			};
			const project = caller?.repoId === null;
			if (alongside !== undefined && external)
				error(400, 'Only workspace agents can start a reviewer in a workspace');
			if (base !== undefined && (alongside !== undefined || worktree === 'shared'))
				error(400, 'A base is for a new worktree; a shared one keeps its own');
			if (caller && (alongside !== undefined || (project && worktree === 'shared'))) {
				// the caller's own workspace is where a reviewer may join it too, as with `shared`
				const target =
					alongside === undefined || alongside === callerId
						? caller
						: findControlled(callerId, alongside);
				const owner = findFor(callerId, target.worktreeId);
				if (target.archivedAt || owner.archivedAt) error(409, 'That workspace is archived');
				where = {
					repoId: owner.repoId,
					parentId: callerId,
					worktreeId: owner.id,
					...(owner.base && { base: owner.base })
				};
			} else if (!caller || project || (repository !== undefined && repository !== caller.repoId)) {
				if (!repository) error(400, 'Say which repository to start in (see list_repositories)');
				if (worktree === 'shared')
					error(400, 'A shared worktree must be in the calling workspace’s repository');
				if (!reaches(callerId, repository))
					error(404, `There is no repository ${repository} you have access to`);
				where = {
					repoId: repos.get(repository).id,
					...(caller && { parentId: callerId }),
					...(base && { base })
				};
			} else {
				where = {
					repoId: caller.repoId,
					parentId: callerId,
					...(worktree === 'shared'
						? { worktreeId: caller.worktreeId, ...(caller.base && { base: caller.base }) }
						: base && { base })
				};
			}

			const preferred = caller?.agent ?? AGENTS[0];
			const kind =
				agent ??
				offered?.find((h) => h.agent === preferred)?.agent ??
				offered?.[0]?.agent ??
				preferred;
			if (offered && !offered.some((h) => h.agent === kind))
				error(
					409,
					offered.length ? `Provider ${kind} is unavailable` : 'No providers are available'
				);
			const settings = settingsFor(
				kind,
				caller,
				{ model, effort },
				offered?.find((harness) => harness.agent === kind)
			);
			const id = create({ ...where, agent: kind, settings, prompt, title }, callerId);
			return report(find(id));
		},

		list: (callerId: string): AgentReport[] =>
			descendantsOf(callerId).map((workspace) => report(workspace)),

		get: (callerId: string, id: string): AgentReport => report(findControlled(callerId, id)),

		/** Any workspace (`id`), or the caller's own. */
		workspace(callerId: string, id?: string): Workspace {
			if (id === undefined && isExternal(callerId))
				error(400, 'Say which workspace (workspace_id)');
			const workspace = findFor(callerId, id ?? callerId);
			return workspace.archivedAt ? view(workspace) : workspace;
		},

		/** Delegated messages steer by default. Other authorized messages wait for the next turn. */
		send(callerId: string, id: string, text: string, interrupt?: boolean) {
			const workspace = findFor(callerId, id);
			const project = isProject(callerId);
			const external = isExternal(callerId);
			const delegated =
				descendantsOf(callerId).some((other) => other.id === id) ||
				(!external && find(callerId).parentId === id);
			if (!project && !external && !delegated)
				error(403, 'You can message only the agents you started and the agent that started you');
			if (workspace.archivedAt) error(409, 'Workspace is archived');
			refuseHeld(id);
			if (!project && interrupt && workspace.status === 'running' && !delegated)
				error(
					403,
					'You can only interrupt agents you started; without interrupt, it gets the message when its turn ends'
				);
			const stream = `workspace:${workspace.id}` as const;
			const data = { id: workspace.id, text };
			if (workspace.status === 'idle') {
				const starter = starterOf(workspace);
				if (starter) ensureCapacity(starter);
				if (workspace.queue.length === 0) return say(workspace, text, callerId);
				// messages are waiting (its last turn failed): this one joins them, and sets them off
				store.append({ type: 'workspace.queued', stream, data }, { actor: callerId });
				return say(workspace, workspace.queue[0], null, 'queued');
			}
			if (!(interrupt ?? delegated))
				return void store.append({ type: 'workspace.queued', stream, data }, { actor: callerId });
			say(workspace, text, callerId);
		},

		stop(callerId: string, id: string) {
			stop(findControlled(callerId, id).id);
		},

		/** Resolves once a workspace's agent is idle, or after `timeoutMs` at the latest. */
		async wait(callerId: string, id: string, timeoutMs: number): Promise<AgentReport> {
			const workspace = findFor(callerId, id);
			const snapshot = () => {
				const value = report(workspace);
				const others = childrenOf(callerId).filter(
					(child) => child.id !== id && routedQuestions(child, 'parent').length
				);
				if (others.length) value.childrenAsking = others.map((child) => child.id);
				return value;
			};
			const current = snapshot();
			if (
				workspace.status === 'idle' ||
				current.childrenAsking ||
				(workspace.parentId === callerId && current.parentQuestions)
			)
				return current;
			return new Promise<AgentReport>((resolve) => {
				const waits = waiting.get(id) ?? new Set<Wait>();
				const wait: Wait = {
					callerId,
					finish(result) {
						clearTimeout(timer);
						waits.delete(wait);
						if (!waits.size) waiting.delete(id);
						resolve(result ?? snapshot());
					}
				};
				const timer = setTimeout(() => wait.finish(), timeoutMs);
				waits.add(wait);
				waiting.set(id, waits);
			});
		}
	};

	/**
	 * How full a workspace agent's context is, as its daemon says (ACP `usage_update`): kept
	 * in memory while it works, recorded at once while it does not.
	 */
	function measure(id: string, usage: ContextUsage) {
		const workspace = projection.get().get(id);
		if (!workspace || workspace.archivedAt) return;
		if (workspace.status !== 'running') return keepUsage(workspace, usage);
		if (sameUsage(usages.get(id) ?? workspace.usage, usage)) return;
		usages.set(id, usage);
		for (const listener of usageListeners) listener(id);
	}

	/**
	 * What a workspace's agent suggests saying next, as its daemon says. Recorded, so that it
	 * is still there after a restart; a reconnecting daemon says it again, which changes nothing.
	 * One said while the agent works was meant for a turn that is over.
	 */
	function suggest(id: string, text: string | null) {
		const workspace = projection.get().get(id);
		if (!workspace || workspace.archivedAt || workspace.suggestion === text) return;
		if (text && workspace.status === 'running') return;
		store.append({ type: 'workspace.suggested', stream: `workspace:${id}`, data: { id, text } });
	}

	return {
		access,
		preferences,
		agents,
		parentOf: (id: string) => projection.get().get(id)?.parentId,
		forwardedQuestions: (id: string) =>
			childrenOf(id)
				.filter((child) => child.asking)
				.flatMap((child) =>
					routedQuestions(child, 'forwarded').map((question) => ({
						...question,
						workspaceId: child.id,
						title: child.title
					}))
				),

		async turnBlobs(id: string, turn: number, path: string) {
			const workspace = find(id);
			if (review?.id !== id || review.turn !== turn) {
				const diff = transcriptOf(workspace).filter((item) => item.kind === 'turn')[turn - 1]?.diff;
				if (!diff) return;
				review = { id, turn, files: turnBlobIndex(diff) };
			}
			return (await review.files).get(path);
		},
		followTranscript,
		measure,
		suggest,
		/** Told which workspace's usage changed between events. */
		followUsage(listener: (id: string) => void) {
			usageListeners.add(listener);
			return () => usageListeners.delete(listener);
		},

		/**
		 * All workspaces in use (not archived), newest first or as people moved them, without
		 * their transcripts.
		 */
		all: (): WorkspaceSummary[] =>
			[...projection.get().values()]
				.filter((workspace) => !workspace.archivedAt)
				.reverse()
				.map(summarise),

		archived: () =>
			[...projection.get().values()]
				.flatMap(({ id, title, repoId, archivedAt }) =>
					archivedAt ? [{ id, title, repoId, archivedAt }] : []
				)
				.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)),

		restore(id: string) {
			if (find(id).archivedAt)
				store.append({ type: 'workspace.restored', stream: `workspace:${id}`, data: { id } });
		},

		/** A repository's workspaces in use, newest first, without their transcripts. */
		list: (repoId: string, includeArchived = false): WorkspaceSummary[] =>
			[...projection.get().values()]
				.filter(
					(workspace) => workspace.repoId === repoId && (includeArchived || !workspace.archivedAt)
				)
				.reverse()
				.map(summarise),

		get: (id: string): Workspace => view(find(id)),

		/** The workspaces whose agents started this one, directly or not: the nearest first. */
		ancestors(id: string): WorkspaceSummary[] {
			const found: WorkspaceSummary[] = [];
			for (let at = find(id).parentId; at;) {
				const parent = projection.get().get(at);
				if (!parent || found.some((other) => other.id === parent.id)) break;
				found.push(summarise(parent));
				at = parent.parentId;
			}
			return found;
		},

		/** The workspaces in use that this one's agent started itself, oldest first. */
		children: (id: string): WorkspaceSummary[] => childrenOf(id).map(summarise),

		/** Workspaces to archive with this one, with each owner before its dependents. */
		descendants(id: string): string[] {
			const { repoId } = find(id);
			const dependents = new Map<string, string[]>();
			for (const workspace of projection.get().values()) {
				if (workspace.archivedAt || workspace.repoId !== repoId) continue;
				// A reviewer sent to a different worktree stays with that worktree's owner.
				const owners = [workspace.worktreeId];
				if (repoId !== null && workspace.parentId) {
					const parent = projection.get().get(workspace.parentId);
					if (workspace.worktreeId === workspace.id || workspace.worktreeId === parent?.worktreeId)
						owners.push(workspace.parentId);
				}
				for (const owner of owners) {
					if (owner === workspace.id) continue;
					const group = dependents.get(owner);
					if (group) group.push(workspace.id);
					else dependents.set(owner, [workspace.id]);
				}
			}

			// Nested agents in one worktree can depend on both their parent and its owner.
			const visited = new Set<string>();
			const ordered: string[] = [];
			function visit(owner: string) {
				if (visited.has(owner)) return;
				visited.add(owner);
				for (const child of dependents.get(owner) ?? []) visit(child);
				if (owner !== id) ordered.push(owner);
			}
			visit(id);
			return ordered.reverse();
		},

		/**
		 * Adds an agent to a workspace, at a person's word: a conversation of its own, working
		 * in the workspace's worktree. With nothing to do yet, it waits to be told. Returns
		 * its ID.
		 */
		join(
			id: string,
			{
				agent,
				settings,
				prompt = '',
				images = []
			}: Partial<Pick<NewWorkspace, 'agent' | 'settings' | 'prompt' | 'images'>> = {},
			actor: string | null = null
		): string {
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			const owner = find(workspace.worktreeId);
			return create(
				{
					repoId: owner.repoId,
					agent: agent ?? owner.agent,
					settings: settings ?? owner.settings,
					prompt,
					images,
					worktreeId: owner.worktreeId,
					...(owner.base && { base: owner.base })
				},
				actor
			);
		},
		hasRunningTurn: () => Array.from(projection.get().values()).some((w) => w.status === 'running'),
		worktreeOf: (id: string) => projection.get().get(id)?.worktreeId,
		summary: (id: string): WorkspaceSummary => summarise(find(id)),
		ref,
		refuseHeld,
		locate,

		/**
		 * Starts a workspace with a first message to its agent, in a new worktree off `base`
		 * (where work in the repository starts if absent). Returns the workspace's ID.
		 */
		create: (workspace: NewWorkspace & { base?: string }, actor: string | null = null) =>
			create(workspace, actor),

		/**
		 * Says something to the workspace's agent: at once if it is idle (and nothing is
		 * waiting to go first), otherwise once it has finished what it is doing.
		 */
		send(
			id: string,
			text: string,
			actor: string | null = null,
			images: string[] = [],
			action?: ActionId
		) {
			imageStore.resolve(images);
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			refuseHeld(id);
			nameAfter(workspace, text);
			if (workspace.status === 'idle' && workspace.queue.length === 0)
				return say(workspace, text, actor, undefined, images, action);
			store.append(
				{
					type: 'workspace.queued',
					stream: `workspace:${id}`,
					data: { id, text, ...(action && { action }), ...(images.length && { images }) }
				},
				{ actor }
			);
			// idle with messages waiting: the turn before failed, and this is the nudge to go on
			if (workspace.status === 'idle') say(workspace, workspace.queue[0], actor, 'queued');
		},

		/**
		 * Says something to the workspace's agent now: if it is working, that steers it, in
		 * the middle of what it is doing (ADR-010). Waiting messages keep waiting.
		 */
		steer(id: string, text: string, actor: string | null = null, images: string[] = []) {
			imageStore.resolve(images);
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			refuseHeld(id);

			nameAfter(workspace, text);
			say(workspace, text, actor, undefined, images);
		},

		answer,

		/**
		 * Takes back a waiting message, by its place in the queue. `text` is the message that
		 * was meant: the queue may have moved on since it was looked at, and then nothing is
		 * taken back rather than the wrong message.
		 */
		dequeue(
			id: string,
			index: number,
			text: string,
			actor: string | null = null,
			images?: string[]
		) {
			if (find(id).queue[index] !== text) return;
			if (images && JSON.stringify(find(id).attachments.queue[index]) !== JSON.stringify(images))
				return;
			store.append(
				{ type: 'workspace.dequeued', stream: `workspace:${id}`, data: { id, index } },
				{ actor }
			);
		},

		/**
		 * Keeps workspaces from being given anything to do, and agents from starting in their
		 * worktrees, while something that takes time is done to them (`doing`, as in “being
		 * archived”: what waits for a daemon). Returns a function that ends it. Not in the event
		 * log: it lasts no longer than the request that asked for it.
		 */
		hold(ids: string[], doing: string, archiveIds: string[] = []): () => void {
			ids.forEach(refuseHeld);
			for (const id of ids) held.set(id, doing);
			// A turn ending during teardown must not start queued work or wake its parent.
			for (const id of archiveIds) archiving.add(id);
			return () => {
				for (const id of ids) held.delete(id);
				for (const id of archiveIds) archiving.delete(id);
				for (const report of deferredReports) {
					const { child, parent, text } = report;
					if (archiving.has(child.id) || held.has(parent.id)) continue;
					deferredReports.delete(report);
					if (!child.archivedAt && !parent.archivedAt) deliverReport(child, parent, text);
				}
				for (const id of archiveIds) {
					if (!deferredCompletions.delete(id)) continue;
					const workspace = find(id);
					if (workspace.archivedAt || workspace.lastTurn !== 'completed') continue;
					promoteCompletedQueue(workspace);
					notifyQuestion(workspace);
				}
			};
		},

		async stopForArchive(ids: string[]) {
			const family = ids.map(find);
			const busy = () => family.find((workspace) => workspace.status === 'running');
			for (const workspace of family) {
				if (
					workspace.status === 'running' &&
					!dispatch({ type: 'agent.stop', workspaceId: workspace.id })
				)
					error(503, 'Connect the daemon to stop busy agents.');
			}
			await waitUntil(() => !busy(), 30_000);
			const stillRunning = busy();
			if (stillRunning)
				error(409, `“${stillRunning.title}” is still running. Try archiving again.`);
		},

		stop,
		record,

		/**
		 * Whether anything but this workspace still works in its worktree: only when nothing
		 * does may the worktree go when the workspace is archived.
		 */
		worktreeInUse(id: string): boolean {
			const { worktreeId } = find(id);
			return [...projection.get().values()].some(
				(other) => other.id !== id && other.worktreeId === worktreeId && !other.archivedAt
			);
		},

		/**
		 * The workspaces in use that work in the same worktree as this one, itself included.
		 */
		sharing(id: string): WorkspaceSummary[] {
			const { worktreeId } = find(id);
			return [...projection.get().values()]
				.filter((other) => other.worktreeId === worktreeId && !other.archivedAt)
				.map(summarise);
		},

		/**
		 * Notes that the workspace's worktree was moved to a new branch, to carry on with new
		 * work. The daemon did the moving; see `continueWorkspace`.
		 */
		continued(id: string, branch: string, actor: string | null = null) {
			const { worktreeId } = find(id);
			store.append(
				{
					type: 'workspace.continued',
					stream: `workspace:${worktreeId}`,
					data: { id: worktreeId, branch }
				},
				{ actor }
			);
		},

		/**
		 * Measures the work in a workspace's worktree against another branch from now on
		 * (FDR-001): `base`, or where work in the repository starts where that is `null`. The
		 * branch stays where it is: this only says where it was forked from.
		 */
		setBase(id: string, base: string | null, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.repoId === null) error(409, 'A project has no worktree');
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			if (base !== null) refuseBranch(base);
			const owner = find(workspace.worktreeId);
			// compared with itself, its work would look like none
			if (base !== null && base === owner.worktree?.branch)
				error(400, 'Work can’t be compared with its own branch');
			if (owner.base === base) return;
			store.append(
				{
					type: 'workspace.based',
					stream: `workspace:${owner.id}`,
					data: { id: owner.id, ...(base !== null && { base }) }
				},
				{ actor }
			);
		},

		/**
		 * Notes the branch a daemon says the worktree is on, if that is news: its agent may
		 * have renamed it (as it is asked to) or switched to another. Takes a worktree's ID.
		 */
		onBranch(worktreeId: string, branch: string | null) {
			const known = projection.get().get(worktreeId)?.worktree;
			if (!branch || !known || known.branch === branch) return;
			store.append({
				type: 'workspace.switched',
				stream: `workspace:${worktreeId}`,
				data: { id: worktreeId, branch }
			});
		},

		/**
		 * Changes the settings for the next turn. A running turn keeps its settings.
		 */
		configure(id: string, settings: AgentSettings, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			const chosen = chosenOf({
				...settings,
				permissionMode: settings.permissionMode ?? workspace.settings.permissionMode
			});
			if (sameAgentSettings(chosen, workspace.settings)) return;
			store.append(
				{ type: 'workspace.configured', stream: `workspace:${id}`, data: { id, settings: chosen } },
				{ actor }
			);
		},

		rename(id: string, title: string) {
			const workspace = find(id);
			const clean = title.trim();
			if (!clean || clean.length > 80 || /[\r\n]/.test(clean))
				error(400, 'Enter a name of 1 to 80 characters on one line.');
			if (workspace.manuallyNamed && workspace.title === clean) return;
			store.append(
				{ type: 'workspace.titled', stream: `workspace:${id}`, data: { id, title: clean } },
				{ actor: 'person' }
			);
		},
		retitle,

		/**
		 * Moves a workspace in the list: right above `before`, or to the end where that is
		 * `null`. There is one list: listed by repository, each keeps its order there.
		 */
		move(id: string, before: string | null, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			if (before !== null) {
				const other = find(before);
				if (other.archivedAt) error(400, 'That workspace is archived');
			}
			if (before === id) return;
			store.append(
				{ type: 'workspace.moved', stream: `workspace:${id}`, data: { id, before } },
				{ actor }
			);
		},

		/**
		 * Marks the workspace inactive (put aside for later), or active again, with those that
		 * started it. Prompting it makes it active too.
		 */
		setInactive(id: string, inactive: boolean, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			if (isInactive(projection.get(), id) === inactive) return;
			const type = inactive ? 'workspace.deactivated' : 'workspace.activated';
			store.append({ type, stream: `workspace:${id}`, data: { id } }, { actor });
		},

		/**
		 * Locks the workspace against archiving, or unlocks it (FDR-015). For people only: the
		 * agent API has no way to do it, so no agent can unlock what it then archives.
		 */
		lock(id: string, locked: boolean, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			// an agent working alongside goes with the workspace it works in, which is what is locked
			if (workspace.worktreeId !== id) error(409, 'Lock the workspace this agent works in');
			// not while it is busy (being archived, say): its worktree may be on its way out already
			refuseHeld(id);
			if (workspace.locked === locked) return;
			store.append(
				locked
					? { type: 'workspace.locked', stream: `workspace:${id}`, data: { id } }
					: { type: 'workspace.unlocked', stream: `workspace:${id}`, data: { id } },
				{ actor }
			);
		},

		/** Refuses (409) if any of these workspaces is locked against archiving (FDR-015). */
		refuseLocked(ids: string[]) {
			const locked = ids.map(find).find((workspace) => workspace.locked && !workspace.archivedAt);
			if (locked) error(409, `“${locked.title}” is locked. Unlock it to archive it.`);
		},

		/** Marks the workspace as done with. Its conversation stays readable. */
		archive(id: string, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) return;
			if (workspace.locked) error(409, `“${workspace.title}” is locked. Unlock it to archive it.`);
			if (workspace.status === 'running') error(409, 'Stop the agent before archiving');
			// Children in another repository can keep running after their parent is archived.
			const requests = childrenOf(id).flatMap((child) =>
				routedQuestions(child, 'parent').map(({ id: question }): GeordiEvent => ({
					type: 'workspace.questionForwarded',
					stream: `workspace:${child.id}`,
					data: { id: child.id, question }
				}))
			);
			store.append(
				[...requests, { type: 'workspace.archived', stream: `workspace:${id}`, data: { id } }],
				{ actor }
			);
		},

		/**
		 * Deletes archived workspaces from the log for good (ADR-012, FDR-014), with everyone
		 * who worked in their worktrees and every agent they started, who must be archived too;
		 * and the images sent to them. Their branches and project folders stay. Returns how many
		 * workspaces went, and how many bytes smaller the log got.
		 */
		purge(ids: string[], actor: string | null = null): { purged: number; freed: number } {
			const all = [...projection.get().values()];
			const family = new Map<string, Workspace>();
			const add = (workspace: Workspace) => {
				if (family.has(workspace.id)) return;
				family.set(workspace.id, workspace);
				for (const other of all)
					if (
						(other.worktreeId === workspace.id || starterOf(other) === workspace.id) &&
						other.id !== workspace.id
					)
						add(other);
			};
			ids.forEach((id) => add(find(id)));
			if (!family.size) return { purged: 0, freed: 0 };

			for (const workspace of family.values()) {
				if (!workspace.archivedAt) error(409, `“${workspace.title}” is not archived`);
				refuseHeld(workspace.id);
			}
			// where one of them worked alongside a workspace that stays, it said where that one's worktree is
			const worktrees = [
				...new Set([...family.values()].map((workspace) => workspace.worktreeId))
			].flatMap((id) => {
				const owner = family.has(id) ? undefined : projection.get().get(id);
				return owner?.worktree ? [{ id, ...owner.worktree }] : [];
			});
			const images = imageStore.forget(projection.imagesOnlyIn(new Set(family.keys())));
			const { freed, copy } = store.purge(
				[...[...family.keys()].flatMap((id) => projection.streamsOf(id)), ...images.streams],
				{
					type: 'workspace.purged',
					stream: 'purges',
					data: {
						workspaces: [...family.values()].map(({ id, title, parentId, repoId }) => ({
							...(repoId && { repoId }),
							...(parentId && { parentId }),
							id,
							title,
							senderTurns: projection.senderTurns(id),
							born: projection.bornAt(id) ?? 0
						})),
						worktrees
					}
				},
				{ actor }
			);
			if (review && family.has(review.id)) review = undefined;
			images.release(copy);
			return { purged: family.size, freed };
		},

		/**
		 * Workspaces whose agent has worked in a worktree of their own that we never heard of
		 * (a daemon did not say it made it): idle, so that no turn is making one right now.
		 */
		unplaced() {
			return [...projection.get().values()]
				.filter(
					(workspace) =>
						!workspace.archivedAt &&
						workspace.repoId !== null &&
						workspace.worktreeId === workspace.id &&
						!workspace.worktree &&
						workspace.resumeId !== null &&
						workspace.status === 'idle' &&
						!workspace.pendingMessages?.length
				)
				.map((workspace) => workspace.id);
		},

		/**
		 * Called when a daemon (re)connects, with the workspaces whose agents are at work as
		 * far as it has told us. Turns we think are running but the daemon doesn't know about
		 * were lost. Turns it runs that we have given up (stopped while it was away, say) are
		 * stopped now: no agent works on unseen. (One that began to work by itself while we
		 * were apart is not among them; it says so next.)
		 */
		reconcile(running: string[]) {
			const reported = new Set(running);
			for (const workspace of projection.get().values()) {
				if (workspace.archivedAt) continue;
				let working = reported.has(workspace.id);
				if (working)
					for (const item of workspace.transcript)
						if (item.kind === 'question' && item.delivery === 'pending' && item.answers)
							dispatch({
								type: 'agent.answer',
								workspaceId: workspace.id,
								questionId: item.id,
								answers: item.answers
							});
				for (const message of workspace.pendingMessages ?? [])
					if (deliver(workspace, message, working)) working = true;
				// A restart can fall between recording completion and promoting the queue.
				promoteCompletedQueue(workspace);
				if (workspace.lastTurn !== 'failed' && workspace.lastTurn !== 'stopped')
					notifyQuestion(workspace);
			}
			for (const id of running)
				if (projection.get().get(id)?.status !== 'running')
					dispatch({ type: 'agent.stop', workspaceId: id });
			for (const workspace of projection.get().values())
				if (
					workspace.status === 'running' &&
					!workspace.pendingMessages?.length &&
					!reported.has(workspace.id)
				)
					record(workspace.id, {
						kind: 'turn.failed',
						error: 'The daemon lost this turn (it may have restarted)'
					});
		}
	};
}
