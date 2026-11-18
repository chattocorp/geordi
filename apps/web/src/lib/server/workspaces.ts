import { createAgentAccess, isExternal } from './agent-access.ts';
import { createImages } from './images.ts';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import {
	AGENTS,
	SETTING,
	sameAgentSettings,
	type Agent,
	type AgentEvent,
	type AgentPlan,
	type AgentSettings,
	type ContextUsage,
	type SubagentState,
	type SubagentUpdate,
	type ForgeMessage,
	type Harness,
	type Question,
	type ToolDiff,
	type ToolInfo,
	type TurnUsage,
	type WorktreeMode,
	type WorktreeRef
} from '@geordi/protocol';
import type { TurnEnd } from '../attention.ts';
import type { EventStore, GeordiEvent } from './events/index.ts';
import { createUpcaster, type CurrentEvent } from './legacy.ts';
import { instructionsFor } from './instructions.ts';
import type { createRepos } from './repos.ts';

type WorkspaceStream = `workspace:${string}`;

export type WorkspacesEvent =
	| {
			type: 'workspace.created';
			stream: WorkspaceStream;
			data: {
				id: string;
				/** Absent for the Desk, which belongs to no repository (FDR-012). */
				repoId?: string;
				title: string;
				agent: Agent;
				/** The agent settings chosen when the workspace was created. */
				settings?: AgentSettings;
				/** The workspace whose agent started this one (FDR-002). */
				parentId?: string;
				/** The workspace whose worktree this one works in, if not its own. */
				worktreeId?: string;
				/** The branch its worktree starts from, if not the repository's checked-out one. */
				base?: string;
			};
	  }
	/**
	 * Something the user (or another agent) said to the workspace's agent: it starts a turn,
	 * or steers the one under way (ADR-010).
	 * `queued` marks a message that had been waiting: it is the first one in the queue.
	 * `steered` (from before ADR-010) marks one that had interrupted the agent.
	 */
	| {
			type: 'workspace.message';
			stream: WorkspaceStream;
			data: {
				id: string;
				text: string;
				images?: string[];
				senderName?: string;
				queued?: boolean;
				deliveryId?: string;
				steered?: boolean;
			};
	  }
	/**
	 * From before ADR-010, when steering meant stopping the agent's turn: a message that was
	 * to go out as soon as it had. No longer written; one that steers is a `workspace.message`.
	 */
	| {
			type: 'workspace.steered';
			stream: WorkspaceStream;
			data: { id: string; text: string; images?: string[] };
	  }
	/** A message to send once the agent has finished what it is doing. */
	| {
			type: 'workspace.queued';
			stream: WorkspaceStream;
			data: { id: string; text: string; images?: string[] };
	  }
	/** The workspace got a better name than the first line of its first message. */
	| { type: 'workspace.titled'; stream: WorkspaceStream; data: { id: string; title: string } }
	/** The complete agent settings for subsequent turns. */
	| {
			type: 'workspace.configured';
			stream: WorkspaceStream;
			data: { id: string; settings: AgentSettings };
	  }
	/**
	 * The workspace carries on with new work: its worktree moved to a new branch, off where
	 * work in the repository starts. Its conversation goes on.
	 */
	| { type: 'workspace.continued'; stream: WorkspaceStream; data: { id: string; branch: string } }
	/**
	 * The workspace's worktree turned out to be on another branch than was known: its agent
	 * renamed it, or switched to another. It is what the worktree comes back from.
	 */
	| { type: 'workspace.switched'; stream: WorkspaceStream; data: { id: string; branch: string } }
	/**
	 * A person moved the workspace in the sidebar: right above `before`, or to the end of
	 * the list where that is `null`. Workspaces are otherwise listed newest first.
	 */
	| {
			type: 'workspace.moved';
			stream: WorkspaceStream;
			data: { id: string; before: string | null };
	  }
	/** The workspace is done with: out of the lists, its worktree gone, its history kept. */
	| { type: 'workspace.archived'; stream: WorkspaceStream; data: { id: string } }
	/** What a person answered to a question the agent asked: one answer per question, in their order. */
	| {
			type: 'workspace.answered';
			stream: WorkspaceStream;
			/** Historical answers have no pending flag and were final when recorded. */
			data: { id: string; question: string; answers: string[]; pending?: true };
	  }
	/**
	 * How full the agent's context was at the end of a turn (or when it said so between
	 * turns). What it says during a turn is only kept in memory: it says it after every step.
	 */
	| { type: 'workspace.usage'; stream: WorkspaceStream; data: { id: string; usage: ContextUsage } }
	/** A waiting message was taken back; `index` is its place in the queue at the time. */
	| { type: 'workspace.dequeued'; stream: WorkspaceStream; data: { id: string; index: number } }
	/** Whatever the daemon reports, stored verbatim. */
	| {
			type: 'workspace.output';
			stream: WorkspaceStream;
			data: { id: string; event: AgentEvent; cursor?: string };
	  };

export type SubagentItem = {
	kind: 'subagent';
	id: string;
	at: string;
	title?: string | null;
	description?: string | null;
	state: SubagentState;
	items: (
		| SubagentItem
		| Extract<SubagentUpdate, { kind: 'message' }>
		| Extract<TranscriptItem, { kind: 'tool' }>
	)[];
};

/** Replace only the path to the changed reviewer. Prior edits may still be
 * waiting for delivery to a follower and must keep their original values. */
function subagentEdit(
	items: readonly (TranscriptItem | SubagentItem['items'][number])[],
	[id, ...nested]: string[],
	update: SubagentUpdate,
	at: string
): [number, number, SubagentItem] {
	const index = items.findIndex((item) => item.kind === 'subagent' && item.id === id);
	const previous = items[index];
	const child: SubagentItem =
		previous?.kind === 'subagent'
			? { ...previous }
			: { kind: 'subagent', id, at, state: 'unknown', items: [] };
	if (nested.length) {
		child.items = child.items.toSpliced(...subagentEdit(child.items, nested, update, at));
	} else if (update.kind === 'info') {
		if (update.title !== undefined) child.title = update.title;
		if (update.description !== undefined) child.description = update.description;
		if (update.state !== undefined) child.state = update.state;
	} else {
		const entryIndex = child.items.findIndex(
			(item) => item.kind === update.kind && item.id === update.id
		);
		const previousEntry = child.items[entryIndex];
		const entry =
			update.kind === 'message'
				? update
				: {
						name: 'Tool',
						input: '',
						output: null,
						isError: false,
						at,
						...(previousEntry?.kind === 'tool' && previousEntry),
						...update
					};
		child.items = entryIndex < 0 ? [...child.items, entry] : child.items.with(entryIndex, entry);
	}
	return index < 0 ? [items.length, 0, child] : [index, 1, child];
}

export type TranscriptItem =
	| SubagentItem
	/** `from`: the workspace whose agent said it, where it was not a person. */
	| {
			kind: 'user';
			text: string;
			images?: string[];
			at: string;
			from?: string;
			senderName?: string;
	  }
	| { kind: 'text'; text: string; at: string }
	| { kind: 'plan'; id: string; plan: AgentPlan; at: string }
	| ({
			kind: 'tool';
			id: string;
			name: string;
			input: string;
			output: string | null;
			isError: boolean;
			/** What it changed in files, once it succeeded; absent in events from before diffs were kept. */
			diff?: ToolDiff;
			at: string;
	  } & ToolInfo)
	| { kind: 'error'; error: string; at: string }
	/** What the turn that ends here used, where its agent said. */
	| { kind: 'usage'; usage: TurnUsage; at: string }
	/**
	 * Something the agent asked the person, which it waits to hear about. `answers` once it
	 * was answered; no longer `open` once it was, or the turn ended without.
	 */
	| {
			kind: 'question';
			id: string;
			questions: Question[];
			blocking?: boolean;
			delivery?: 'pending' | 'unconfirmed';
			answers: string[] | null;
			open: boolean;
			at: string;
	  }
	/** Something that happened to the workspace, said in passing: neither side's words. */
	| { kind: 'note'; text: string; at: string };

export type TranscriptEdit = [index: number, remove: number, ...items: TranscriptItem[]];
export type TranscriptUpdate = TranscriptItem[] | { edits: TranscriptEdit[] };

export type TranscriptFollower = { read(): TranscriptUpdate; close(): void };

type Asked = Extract<TranscriptItem, { kind: 'question' }>;

function toolById(workspace: Workspace, id: string) {
	return workspace.transcript.findLast(
		(item): item is Extract<TranscriptItem, { kind: 'tool' }> =>
			item.kind === 'tool' && item.id === id
	);
}

function questionById(workspace: Workspace, id: string) {
	return workspace.transcript.findLast(
		(item): item is Asked => item.kind === 'question' && item.id === id
	);
}

function updateAsking(workspace: Workspace) {
	workspace.asking = workspace.transcript.some(
		(item) => item.kind === 'question' && item.open && item.blocking !== false
	);
}

type Status = 'running' | 'idle';

/**
 * A piece of work: one conversation with one agent, in a worktree on its own branch
 * (FDR-001). A workspace started by another workspace's agent may work in that one's
 * worktree instead of its own.
 */
export type Workspace = {
	outputCursor?: string;
	pendingSteers?: { deliveryId: string; text: string; images: string[] }[];
	id: string;
	/** `null` for the Desk: a workspace that belongs to no repository, for orchestrating (FDR-012). */
	repoId: string | null;
	title: string;
	/** Whether someone gave it its title on purpose (its agent, or the agent that started it). */
	named: boolean;
	agent: Agent;
	/** The agent settings for its next turn. */
	settings: AgentSettings;
	status: Status;
	/** Whether its agent has asked the person something, and waits for the answer. */
	asking: boolean;
	/** How its latest turn ended; `null` while one is running, and before the first. */
	lastTurn: TurnEnd | null;
	/** How full its agent's context is, as it last said; `null` before it has. */
	usage: ContextUsage | null;
	/** The workspace whose agent started this one; `null` if a person did. */
	parentId: string | null;
	/** The external client (its grant) that started it, if one did: it may supervise it. */
	startedBy: string | null;
	/** The workspace whose worktree this one works in: its own ID, unless it shares another's. */
	worktreeId: string;
	/** The branch the worktree started from, if not the repository's checked-out one. */
	base: string | null;
	worktree: { path: string; branch: string } | null;
	/** The agent CLI's session ID, for resuming the conversation. */
	resumeId: string | null;
	/** Messages waiting for the agent to finish its turn, in the order they will be sent. */
	queue: string[];
	attachments: { queue: string[][] };
	/**
	 * Something the agent has to be told before anything else, with its next message: what
	 * happened to its workspace since it last looked.
	 */
	briefing: string | null;
	/** Who sent the messages that wait, in step with `queue`: workspace IDs, `null` for people. */
	sentBy: { queue: (string | null)[] };
	/** When the workspace was archived; `null` while it is in use. */
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
	transcript: TranscriptItem[];
};

function initialWorkspace(
	created: Extract<CurrentEvent, { type: 'workspace.created' }>['data'],
	at: string,
	actor: string | null = null
): Workspace {
	const {
		repoId = null,
		parentId = null,
		worktreeId = created.id,
		base = null,
		settings = {},
		...data
	} = created;
	return {
		...data,
		repoId,
		named: false,
		settings,
		status: 'idle',
		asking: false,
		lastTurn: null,
		usage: null,
		parentId,
		startedBy: actor && isExternal(actor) ? actor : null,
		worktreeId,
		base,
		worktree: null,
		resumeId: null,
		queue: [],
		attachments: { queue: [] },
		sentBy: { queue: [] },
		briefing: null,
		archivedAt: null,
		createdAt: at,
		updatedAt: at,
		transcript: []
	};
}

export type WorkspaceSummary = Omit<Workspace, 'transcript'>;

/** What an agent sees of an agent it started (FDR-002). */
export type AgentReport = {
	id: string;
	parentId: string | null;
	agent: Agent;
	title: string;
	status: Status;
	/** The branch the agent works on, once its worktree exists. */
	branch: string | null;
	/** Whether it works in the same directory as the agent that started it. */
	sharesWorktree: boolean;
	/** What the agent said in its latest turn; `error` if that turn failed. */
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

/** What an agent is told, with its next message, after its workspace was continued. */
const continuedBriefing = (branch: string) =>
	`(A note from Geordi, not from the person: since your last turn, this workspace was continued. Its working directory is now on a new branch, \`${branch}\`, which starts from the latest state of the repository's main branch. What you did before is not on it unless it was merged; your earlier branch still exists. Look at the files as they are now before you rely on what you remember of them.)`;

/** What a workspace is called until it is told what to do, or named. */
export const UNTITLED = 'New workspace';

/** How often an agent may name its own workspace. */
const MAX_NAMES = 3;

type NewWorkspace = {
	/** `null` for the Desk (FDR-012). */
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
	const imageStore = createImages(store);
	/**
	 * Who steered a workspace's agent in the way of before ADR-010 (`workspace.steered`), until
	 * the message that came of it: only ever set while old events are replayed.
	 */
	const steerers = new Map<string, string | null>();
	const listeners = new Map<string, Set<(edit: TranscriptEdit) => void>>();
	// The first session of an old workspace could have a different ID.
	const sessionStreams = new Map<string, string>();
	// Sender attribution on a later replay must reflect who existed at the time.
	const born = new Map<string, number>();

	function apply(
		workspaces: Map<string, Workspace>,
		event: CurrentEvent,
		at: string,
		actor: string | null,
		seq: number,
		steering = steerers,
		restoring = false
	) {
		if (event.type === 'workspace.created') {
			workspaces.set(event.data.id, initialWorkspace(event.data, at, actor));
			return;
		}

		if (event.type === 'workspace.moved') {
			move(workspaces, event.data.id, event.data.before);
			return;
		}
		// not something that happened in it: it leaves its place in the lists alone
		if (event.type === 'workspace.usage') {
			const measured = workspaces.get(event.data.id);
			if (measured) measured.usage = event.data.usage;
			return;
		}

		const workspace = workspaces.get(event.data.id);
		if (!workspace) return;
		workspace.updatedAt = at;
		const { id, transcript } = workspace;
		function edit(index: number, remove: number, ...items: TranscriptItem[]) {
			transcript.splice(index, remove, ...items);
			if (!restoring)
				for (const listener of listeners.get(id) ?? []) listener([index, remove, ...items]);
		}
		const append = (item: TranscriptItem) => edit(transcript.length, 0, item);
		const replace = (item: TranscriptItem, next: TranscriptItem) =>
			edit(transcript.indexOf(item), 1, next);
		function closeQuestion(question: Asked) {
			if (question.open || question.delivery === 'pending')
				replace(question, {
					...question,
					open: false,
					...(question.delivery === 'pending' && { delivery: 'unconfirmed' })
				});
		}

		if (event.type === 'workspace.titled') {
			workspace.title = event.data.title;
			// a title someone chose, as opposed to one its agent's session goes by
			if (actor) workspace.named = true;
			return;
		}
		if (event.type === 'workspace.configured') {
			workspace.settings = event.data.settings;
			return;
		}
		if (event.type === 'workspace.continued') {
			const { branch } = event.data;
			// everyone who works in that worktree is on the new branch, measured against where it starts
			for (const other of workspaces.values()) {
				if (other.worktreeId !== workspace.worktreeId) continue;
				other.base = null;
				other.briefing = continuedBriefing(branch);
			}
			const owner = workspaces.get(workspace.worktreeId);
			if (owner?.worktree) owner.worktree = { ...owner.worktree, branch };
			append({ kind: 'note', text: `Continued on a new branch, ${branch}`, at });
			return;
		}
		if (event.type === 'workspace.switched') {
			if (workspace.worktree)
				workspace.worktree = { ...workspace.worktree, branch: event.data.branch };
			return;
		}
		if (event.type === 'workspace.archived') {
			workspace.archivedAt = at;
			if (!restoring) workspace.transcript = [];
			workspace.queue = [];
			workspace.attachments.queue = [];
			return;
		}
		if (event.type === 'workspace.queued') {
			workspace.queue.push(event.data.text);
			workspace.attachments.queue.push(event.data.images ?? []);
			workspace.sentBy.queue.push(actor);
			return;
		}
		if (event.type === 'workspace.dequeued') {
			workspace.queue.splice(event.data.index, 1);
			workspace.attachments.queue.splice(event.data.index, 1);
			workspace.sentBy.queue.splice(event.data.index, 1);
			return;
		}
		if (event.type === 'workspace.steered') {
			steering.set(workspace.id, actor);
			return;
		}
		if (event.type === 'workspace.answered') {
			const question = questionById(workspace, event.data.question);
			if (question && (question.open || !event.data.pending)) {
				replace(question, {
					...question,
					answers: event.data.answers,
					open: false,
					...(event.data.pending && { delivery: 'pending' })
				});
				updateAsking(workspace);
			}
			return;
		}
		if (event.type === 'workspace.message') {
			if (event.data.deliveryId)
				(workspace.pendingSteers ??= []).push({
					deliveryId: event.data.deliveryId,
					text: event.data.text,
					images: event.data.images ?? []
				});
			// said by whoever queued it, or steered with it, or says it now
			let sender = actor;
			if (event.data.queued) {
				workspace.queue.shift();
				workspace.attachments.queue.shift();
				sender = workspace.sentBy.queue.shift() ?? null;
			}
			if (event.data.steered) {
				sender = steering.get(workspace.id) ?? null;
				steering.delete(workspace.id);
			}
			workspace.status = 'running';
			workspace.lastTurn = null;
			workspace.briefing = null; // it went out with this message
			// an agent's word is marked as such; a person's is the rule
			const from =
				sender && (isExternal(sender) || (born.get(sender) ?? Infinity) <= seq)
					? sender
					: undefined;
			append({
				kind: 'user',
				text: event.data.text,
				...(event.data.images?.length && { images: event.data.images }),
				at,
				...(from && { from }),
				...(event.data.senderName && { senderName: event.data.senderName })
			});
			return;
		}

		if (event.data.cursor) workspace.outputCursor = event.data.cursor;
		const output = event.data.event;
		switch (output.kind) {
			case 'subagent':
				if (output.path.length) edit(...subagentEdit(transcript, output.path, output.update, at));
				break;
			case 'message.received':
				workspace.pendingSteers = workspace.pendingSteers?.filter(
					(s) => s.deliveryId !== output.id
				);
				break;
			case 'worktree': {
				// the worktree belongs to whoever owns it, which may be another workspace
				const owner = workspaces.get(workspace.worktreeId);
				if (owner) owner.worktree = { path: output.path, branch: output.branch };
				break;
			}
			case 'resume':
				workspace.resumeId = output.id;
				break;
			case 'text':
				append({ kind: 'text', text: output.text, at });
				break;
			case 'plan': {
				const index = transcript.findIndex((item) => item.kind === 'plan' && item.id === output.id);
				// Wrappers can reuse a session-wide checklist in the next exchange.
				// Bring it into that reply so live updates stay visible.
				const previous = transcript[index];
				const exchange = transcript.findLastIndex(
					(item) => item.kind === 'user' || item.kind === 'note'
				);
				if (output.plan && previous?.kind === 'plan' && index > exchange) {
					edit(index, 1, { ...previous, plan: output.plan });
				} else {
					if (index >= 0) edit(index, 1);
					if (output.plan) append({ ...output, plan: output.plan, at });
				}
				break;
			}
			case 'tool':
				append({ ...output, output: null, isError: false, at });
				break;
			case 'tool.update': {
				const tool = toolById(workspace, output.id);
				if (tool) replace(tool, { ...tool, ...output, kind: 'tool' });
				break;
			}
			case 'tool.result': {
				const tool = toolById(workspace, output.id);
				if (tool)
					replace(tool, {
						...tool,
						output: output.output,
						isError: output.isError,
						...(output.diff && { diff: output.diff })
					});
				break;
			}
			case 'answer.received': {
				const question = questionById(workspace, output.id);
				if (question?.answers && question.delivery) {
					const next = { ...question };
					delete next.delivery;
					replace(question, next);
				}
				break;
			}
			case 'question.closed': {
				const question = questionById(workspace, output.id);
				if (question) closeQuestion(question);
				updateAsking(workspace);
				break;
			}
			case 'question':
				if (questionById(workspace, output.id)) break;
				append({ ...output, answers: null, open: true, at });
				if (output.blocking !== false) workspace.asking = true;
				break;
			case 'turn.started':
				workspace.status = 'running';
				workspace.lastTurn = null;
				break;
			case 'turn.completed':
			case 'turn.failed':
				workspace.status = 'idle';
				// a turn that is over waits for no answer
				workspace.asking = false;
				for (const item of transcript) if (item.kind === 'question') closeQuestion(item);
				if (output.kind === 'turn.failed') {
					workspace.pendingSteers = [];
					workspace.lastTurn = output.error === 'Stopped' ? 'stopped' : 'failed';
					// (before ADR-010) stopped to make way for a steering message: not a failure worth showing
					if (!(output.error === 'Stopped' && steering.has(workspace.id)))
						append({ kind: 'error', error: output.error, at });
				} else workspace.lastTurn = 'completed';
				if (output.usage) append({ kind: 'usage', usage: output.usage, at });
				break;
		}
	}

	/**
	 * Puts a workspace right above another in the list, or last. The map is in the order
	 * lists show reversed (oldest first), so above means after.
	 */
	function move(workspaces: Map<string, Workspace>, id: string, before: string | null) {
		const moving = workspaces.get(id);
		if (!moving || id === before) return;
		const entries = [...workspaces].filter(([other]) => other !== id);
		const at = before === null ? 0 : entries.findIndex(([other]) => other === before) + 1;
		if (at === 0 && before !== null) return; // gone: it stays where it is
		entries.splice(at, 0, [id, moving]);
		workspaces.clear();
		for (const [other, workspace] of entries) workspaces.set(other, workspace);
	}

	// Mutates in place (O(1) per event during replay); readers get copies. Events from
	// before a workspace had exactly one conversation are translated first (see legacy.ts).
	const upcast = createUpcaster();
	const projection = store.project(
		'workspaces',
		() => new Map<string, Workspace>(),
		(workspaces, event) => {
			for (const current of upcast(event)) {
				if (current.type === 'workspace.created') {
					born.set(current.data.id, event.seq);
					if (event.type === 'session.created') sessionStreams.set(current.data.id, event.stream);
				}
				apply(workspaces, current, event.at, event.actor, event.seq);
			}
			return workspaces;
		},
		['workspace', 'session']
	);

	function find(id: string): Workspace {
		const workspace = projection.get().get(id);
		if (!workspace) error(404, `Workspace ${id} not found`);
		return workspace;
	}

	// Reuse the normal reducer for a private reconstruction. Session mappings were learned
	// during replay. Never feed creation events back into that stateful upcaster.
	function transcriptOf(workspace: Workspace): TranscriptItem[] {
		if (!workspace.archivedAt) return workspace.transcript;
		const { id, repoId, agent, title } = workspace;
		const restored = initialWorkspace(
			{ id, ...(repoId && { repoId }), agent, title },
			workspace.createdAt
		);
		const copy = new Map([[id, restored]]);
		const steering = new Map<string, string | null>();
		const createdAtSeq = born.get(id)!;
		const events = store.readStream(`workspace:${id}`);
		const session = sessionStreams.get(id);
		if (session) {
			for (const event of store.readStream(session)) events.push(event);
			events.sort((a, b) => a.seq - b.seq);
		}
		for (const event of events) {
			if (event.seq <= createdAtSeq) continue;
			if (event.type === 'workspace.created' || event.type === 'session.created') continue;
			for (const current of upcast(event))
				apply(copy, current, event.at, event.actor, event.seq, steering, true);
		}
		return restored.transcript;
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

	const summarise = ({ transcript, ...workspace }: Workspace): WorkspaceSummary => {
		void transcript;
		return structuredClone({
			...workspace,
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
		const followers = listeners.get(id) ?? new Set<(edit: TranscriptEdit) => void>();
		listeners.set(id, followers);
		followers.add(receive);
		return {
			read(): TranscriptUpdate {
				const previous = edits;
				edits = [];
				return previous ? { edits: previous } : transcriptOf(find(id)).slice();
			},
			close() {
				followers.delete(receive);
				if (!followers.size) listeners.delete(id);
			}
		};
	}

	/** What a daemon needs to find the worktree a workspace works in. The Desk has none. */
	function ref(id: string): WorktreeRef {
		const { repoId, worktreeId, base } = find(id);
		if (repoId === null) error(409, 'The Desk has no worktree');
		const owner = find(worktreeId);
		const branch = owner.worktree?.branch;
		const parents: NonNullable<WorktreeRef['parents']> = [];
		let child = owner;
		while (child.base && child.parentId) {
			const parent = find(find(child.parentId).worktreeId);
			parents.push({ worktreeId: parent.id, branch: child.base });
			child = parent;
		}
		return {
			worktreeId,
			repoPath: repos.get(repoId).path,
			...(base && { base }),
			...(parents.length && { parents }),
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
		store.append({
			type: 'workspace.output',
			stream: `workspace:${id}`,
			data: { id, event, ...(cursor && { cursor }) }
		});
		const measured = usages.get(id);
		if (measured && workspace.status === 'idle') keepUsage(workspace, measured);
		if (event.kind === 'turn.completed' && workspace.queue.length > 0)
			say(workspace, workspace.queue[0], null, 'queued');
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

	/** Workspaces that must not start a turn right now; see `hold`. */
	const held = new Set<string>();

	/**
	 * Says something to the workspace's agent, through a daemon: that starts a turn, or, if
	 * the agent is at work, steers it. An agent at work that cannot be reached is not told
	 * (and that is an error); one that was to start is noted as having failed to.
	 */
	function deliver(workspace: Workspace, text: string, images: string[], deliveryId?: string) {
		return dispatch({
			type: 'agent.message',
			workspaceId: workspace.id,
			...(workspace.repoId === null
				? { worktreeId: workspace.worktreeId, desk: true as const }
				: ref(workspace.id)),
			agent: workspace.agent,
			settings: workspace.settings,
			apiToken: tokenFor(workspace),
			resumeId: workspace.resumeId,
			instructions: instructionsFor({
				parent: (workspace.parentId && projection.get().get(workspace.parentId)) || null,
				desk: workspace.repoId === null,
				sharesWorktree: workspace.worktreeId !== workspace.id,
				named: workspace.named,
				mayDelegate: depthOf(workspace) < limits.depth
			}),
			...(images.length && { images: images.map(imageStore.get) }),
			...(deliveryId && { deliveryId }),
			prompt: text
		});
	}

	function say(
		workspace: Workspace,
		text: string,
		actor: string | null,
		from?: 'queued',
		images: string[] = []
	) {
		const { id } = workspace;
		const sender = from === 'queued' ? workspace.sentBy.queue[0] : actor;
		const senderName = sender
			? (access.name(sender) ?? projection.get().get(sender)?.title)
			: undefined;
		const steers = workspace.status === 'running';
		if (from === 'queued') images = workspace.attachments.queue[0];
		const deliveryId = steers ? randomUUID() : undefined;
		const prompt = workspace.briefing ? workspace.briefing + '\n\n' + text : text;
		const sent = deliver(workspace, prompt, images, deliveryId);
		if (!sent && steers) error(503, 'No daemon is connected: the agent cannot be told right now');
		store.append(
			{
				type: 'workspace.message',
				stream: `workspace:${id}`,
				data: {
					id,
					text,
					...(deliveryId && { deliveryId }),
					...(images.length && { images }),
					...(from && { [from]: true }),
					...(senderName && { senderName })
				}
			},
			{ actor }
		);
		if (!sent) record(id, { kind: 'turn.failed', error: 'No daemon connected' });
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
			if (!SETTING.test(value)) error(400, `That is not a ${key}: ${value}`);
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
		retitle(workspace.id, text.split('\n')[0].slice(0, 300));
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
		const { repoId, ...rest } = workspace;
		if (repoId !== null)
			repos.get(repoId); // 404s for unknown repos
		// there is one Desk: a new one only once the last was started afresh (archived)
		else if (theDesk()) error(409, 'The Desk is there already');
		const chosen = chosenOf(settings);
		const id = randomUUID();
		// The first line; the UI clamps long titles visually. One started without a word is
		// named when it is first told something (`nameAfter`).
		const title = prompt.split('\n')[0].trim().slice(0, 300) || UNTITLED;
		store.append(
			{
				type: 'workspace.created',
				stream: `workspace:${id}`,
				data: {
					id,
					title,
					...(repoId !== null && { repoId }),
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
		// a token for chosen repositories doesn't reach the Desk, which is in none (FDR-012)
		return !isExternal(callerId) || (repoId !== null && access.reaches(callerId, repoId));
	}

	/** A workspace the caller may see. One in a repository it may not doesn't exist for it. */
	function findFor(callerId: string, id: string): Workspace {
		const workspace = projection.get().get(id);
		if (!workspace || !reaches(callerId, workspace.repoId)) error(404, `Workspace ${id} not found`);
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

	/** The Desk (FDR-012), if it has a conversation going: the one workspace without a repository in use. */
	const theDesk = (): Workspace | undefined =>
		[...projection.get().values()].find((w) => w.repoId === null && !w.archivedAt);

	/**
	 * Whether the caller is the Desk's agent (FDR-012): it acts for the person sitting at it, and
	 * may do whatever they may.
	 */
	const isDesk = (callerId: string) =>
		!isExternal(callerId) && projection.get().get(callerId)?.repoId === null;

	/**
	 * A workspace the caller started (directly or not). Anything else doesn't exist for it,
	 * unless the caller is the Desk, which may supervise any.
	 */
	function findControlled(callerId: string, id: string): Workspace {
		if (isDesk(callerId)) return find(id);
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

	function report(workspace: Workspace): AgentReport {
		const transcript = transcriptOf(workspace);
		const turn = transcript.slice(transcript.findLastIndex((item) => item.kind === 'user') + 1);
		const texts = turn.flatMap((item) => (item.kind === 'text' ? [item.text] : []));
		return {
			id: workspace.id,
			parentId: workspace.parentId,
			agent: workspace.agent,
			title: workspace.title,
			status: workspace.status,
			branch: projection.get().get(workspace.worktreeId)?.worktree?.branch ?? null,
			sharesWorktree: workspace.worktreeId !== workspace.id,
			reply: texts.join('\n\n'),
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
			branch: projection.get().get(workspace.worktreeId)?.worktree?.branch ?? null,
			url: `/workspaces/${id}`
		};
	}

	/**
	 * What agents can do through the agent API (ADR-004, FDR-002). Every function takes the
	 * caller: a workspace, or an external client's grant. It is recorded as the actor of what
	 * it causes. A workspace's agent can read any workspace, an external client those in the
	 * repositories it was granted; supervising (messaging, interrupting, stopping, archiving)
	 * is for whoever started it, directly or not.
	 */
	const agents = {
		authenticate,
		isDesk,
		reportWorkspace: (callerId: string, id: string) => report(findFor(callerId, id)),
		listRepositories: (callerId: string) =>
			repos
				.list()
				.filter((repo) => reaches(callerId, repo.id))
				.map(({ id, name, path }) => ({ id, name, path })),
		listWorkspaces(callerId: string, archived: boolean) {
			return [...projection.get().values()]
				.reverse()
				.filter((w) => (archived || !w.archivedAt) && reaches(callerId, w.repoId))
				.map(entry);
		},
		readWorkspace(callerId: string, id: string, before?: number) {
			const workspace = findFor(callerId, id);
			const transcript = transcriptOf(workspace);
			const messages = transcript.filter(
				(item) =>
					item.kind === 'user' ||
					item.kind === 'text' ||
					item.kind === 'question' ||
					item.kind === 'error'
			);
			const end = Math.min(before ?? messages.length, messages.length);
			const start = Math.max(0, end - 50);
			return {
				...entry(workspace),
				messages: messages.slice(start, end),
				before: start || null,
				pendingQuestions: transcript.filter((item) => item.kind === 'question' && item.open)
			};
		},

		/**
		 * Names the caller's own workspace, so that people can tell it from the others. A few
		 * times at most: a name that keeps changing is no name.
		 */
		name(callerId: string, title: string) {
			const mine = store
				.readStream(`workspace:${callerId}`)
				.filter((event) => event.type === 'workspace.titled' && event.actor === callerId);
			if (mine.length >= MAX_NAMES)
				error(429, `You have named this workspace ${MAX_NAMES} times already; it keeps its name`);
			retitle(callerId, title, callerId);
			return { title: find(callerId).title };
		},

		/**
		 * Starts an agent on the caller's behalf, as a workspace of its own. A workspace's agent
		 * starts it in a new worktree branched from its own (`own`), or in its own worktree
		 * (`shared`); an external client starts it in a `repository`, as a person would. An
		 * agent of the caller's kind runs as the caller does, but for the `model` and `effort`
		 * asked for. An effort is checked against what is `offered`, when that is known.
		 */
		start(
			callerId: string,
			{
				repository,
				worktree,
				agent,
				model,
				effort,
				prompt,
				title
			}: {
				repository?: string;
				worktree: WorktreeMode;
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
			if (caller && depthOf(caller) + 1 > limits.depth)
				error(403, `Agents can only be nested ${limits.depth} deep`);
			ensureCapacity(callerId);

			let where: Pick<Workspace, 'repoId'> & {
				parentId?: string;
				worktreeId?: string;
				base?: string;
			};
			// the Desk, like a client outside Geordi, starts agents in whichever repository it names
			const desk = caller?.repoId === null;
			if (!caller || desk) {
				if (!repository) error(400, 'Say which repository to start in (see list_repositories)');
				if (worktree === 'shared')
					error(
						400,
						desk
							? 'The Desk has no worktree to share'
							: 'Only an agent in a workspace can share its worktree'
					);
				if (!reaches(callerId, repository))
					error(404, `There is no repository ${repository} you have access to`);
				where = { repoId: repos.get(repository).id, ...(desk && { parentId: callerId }) };
			} else {
				if (repository && repository !== caller.repoId)
					error(403, 'Agents start agents in their own repository');
				const branch = projection.get().get(caller.worktreeId)?.worktree?.branch;
				if (!branch) error(409, 'Your workspace has no worktree yet');
				where = {
					repoId: caller.repoId,
					parentId: callerId,
					...(worktree === 'shared'
						? { worktreeId: caller.worktreeId, ...(caller.base && { base: caller.base }) }
						: { base: branch })
				};
			}

			const kind = agent ?? caller?.agent ?? AGENTS[0];
			const settings = settingsFor(
				kind,
				caller,
				{ model, effort },
				offered?.find((harness) => harness.agent === kind)
			);
			const id = create({ ...where, agent: kind, settings, prompt, title }, callerId);
			return report(find(id));
		},

		list: (callerId: string): AgentReport[] => descendantsOf(callerId).map(report),

		get: (callerId: string, id: string): AgentReport => report(findControlled(callerId, id)),

		/** Any workspace (`id`), or the caller's own. */
		workspace(callerId: string, id?: string): Workspace {
			if (id === undefined && isExternal(callerId)) error(400, 'Say which workspace (agent_id)');
			const workspace = findFor(callerId, id ?? callerId);
			return workspace.archivedAt ? view(workspace) : workspace;
		},

		/**
		 * Says something to an agent: at once if it is idle; otherwise once it has finished what
		 * it is doing, or (`interrupt`) now, steering what it is doing. A workspace's agent
		 * messages the agents it started; an external client, any agent, but it interrupts only
		 * those it started: a person's agent is not turned around in the middle of its work.
		 */
		send(callerId: string, id: string, text: string, interrupt = false) {
			const external = isExternal(callerId);
			const workspace = external ? findFor(callerId, id) : findControlled(callerId, id);
			if (workspace.archivedAt) error(409, 'Workspace is archived');
			if (
				external &&
				interrupt &&
				workspace.status === 'running' &&
				!descendantsOf(callerId).some((other) => other.id === workspace.id)
			)
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
			if (!interrupt)
				return void store.append({ type: 'workspace.queued', stream, data }, { actor: callerId });
			say(workspace, text, callerId);
		},

		stop(callerId: string, id: string) {
			stop(findControlled(callerId, id).id);
		},

		/** Resolves once a workspace's agent is idle, or after `timeoutMs` at the latest. */
		async wait(callerId: string, id: string, timeoutMs: number): Promise<AgentReport> {
			const workspace = findFor(callerId, id);
			if (workspace.status === 'running')
				await new Promise<void>((resolve) => {
					const done = () => {
						clearTimeout(timeout);
						unsubscribe();
						resolve();
					};
					const timeout = setTimeout(done, timeoutMs);
					const unsubscribe = store.subscribe(() => workspace.status === 'idle' && done());
				});
			return report(workspace);
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

	return {
		access,
		agents,
		followTranscript,
		measure,
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

		/** A repository's workspaces in use, newest first, without their transcripts. */
		list: (repoId: string): WorkspaceSummary[] =>
			[...projection.get().values()]
				.filter((workspace) => workspace.repoId === repoId && !workspace.archivedAt)
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

		/**
		 * The IDs of the workspaces in use that belong to this one, and go when it goes: those
		 * its agent started, the agents working in its worktree (whoever started them), and
		 * theirs. Parents first. None for the Desk: what it started is work in a repository,
		 * which carries on without it (FDR-012).
		 */
		descendants(id: string): string[] {
			if (find(id).repoId === null) return [];
			const alongside = [...projection.get().values()].filter(
				(other) => other.id !== id && other.worktreeId === id && !other.archivedAt
			);
			const all = [
				...descendantsOf(id),
				...alongside.flatMap((workspace) => [workspace, ...descendantsOf(workspace.id)])
			];
			return [...new Set(all.map((workspace) => workspace.id))];
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
			if (workspace.repoId === null) error(409, 'The Desk is one conversation');
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
		worktreeOf: (id: string) => projection.get().get(id)?.worktreeId,
		/** The ID of the Desk's conversation (FDR-012); `null` until something is said there. */
		desk: () => theDesk()?.id ?? null,
		summary: (id: string): WorkspaceSummary => summarise(find(id)),
		ref,

		/** Starts a workspace with a first message to its agent. Returns the workspace's ID. */
		create: (workspace: NewWorkspace, actor: string | null = null) => create(workspace, actor),

		/**
		 * Says something to the workspace's agent: at once if it is idle (and nothing is
		 * waiting to go first), otherwise once it has finished what it is doing.
		 */
		send(id: string, text: string, actor: string | null = null, images: string[] = []) {
			imageStore.resolve(images);
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			if (held.has(id)) error(409, 'This workspace is being archived');
			nameAfter(workspace, text);
			if (workspace.status === 'idle' && workspace.queue.length === 0)
				return say(workspace, text, actor, undefined, images);
			store.append(
				{
					type: 'workspace.queued',
					stream: `workspace:${id}`,
					data: { id, text, ...(images.length && { images }) }
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
			if (held.has(id)) error(409, 'This workspace is being archived');

			nameAfter(workspace, text);
			say(workspace, text, actor, undefined, images);
		},

		/**
		 * Answers a question the workspace's agent asked, which it waits to hear about: one
		 * answer per question, in their order.
		 */
		answer(id: string, question: string, answers: string[], actor: string | null = null) {
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
		},

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
		 * Keeps workspaces from being given anything to do while something that takes time
		 * is done to them (archiving, which waits for a daemon). Returns a function that ends
		 * it. Not in the event log: it lasts no longer than the request that asked for it.
		 */
		hold(ids: string[]): () => void {
			for (const id of ids) held.add(id);
			return () => ids.forEach((id) => held.delete(id));
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

		retitle,

		/**
		 * Moves a workspace in the list: right above `before`, another of its repository's,
		 * or to the end where that is `null`.
		 */
		move(id: string, before: string | null, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			if (before !== null) {
				const other = find(before);
				if (other.archivedAt || other.repoId !== workspace.repoId)
					error(400, 'Workspaces move among their repository’s');
			}
			if (before === id) return;
			store.append(
				{ type: 'workspace.moved', stream: `workspace:${id}`, data: { id, before } },
				{ actor }
			);
		},

		/** Marks the workspace as done with. Its conversation stays readable. */
		archive(id: string, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) return;
			if (workspace.status === 'running') error(409, 'Stop the agent before archiving');
			store.append(
				{ type: 'workspace.archived', stream: `workspace:${id}`, data: { id } },
				{ actor }
			);
		},

		/**
		 * Called when a daemon (re)connects, with the workspaces whose agents are at work as
		 * far as it has told us. Turns we think are running but the daemon doesn't know about
		 * were lost. Turns it runs that we have given up (stopped while it was away, say) are
		 * stopped now: no agent works on unseen. (One that began to work by itself while we
		 * were apart is not among them; it says so next.)
		 */
		reconcile(running: string[]) {
			for (const workspace of projection.get().values()) {
				if (workspace.archivedAt) continue;
				if (running.includes(workspace.id))
					for (const item of workspace.transcript)
						if (item.kind === 'question' && item.delivery === 'pending' && item.answers)
							dispatch({
								type: 'agent.answer',
								workspaceId: workspace.id,
								questionId: item.id,
								answers: item.answers
							});
				for (const steer of workspace.pendingSteers ?? [])
					deliver(workspace, steer.text, steer.images, steer.deliveryId);
			}
			for (const id of running)
				if (projection.get().get(id)?.status !== 'running')
					dispatch({ type: 'agent.stop', workspaceId: id });
			for (const workspace of projection.get().values())
				if (
					workspace.status === 'running' &&
					!workspace.pendingSteers?.length &&
					!running.includes(workspace.id)
				)
					record(workspace.id, {
						kind: 'turn.failed',
						error: 'The daemon lost this turn (it may have restarted)'
					});
		}
	};
}
