import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import {
	SETTING,
	type Agent,
	type AgentEvent,
	type AgentSettings,
	type ForgeMessage,
	type WorktreeMode,
	type WorktreeRef
} from '@geordi/protocol';
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
				repoId: string;
				title: string;
				agent: Agent;
				/** The model and effort chosen for it; absent where that is left to the agent's CLI. */
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
	 * Something the user (or another agent) said to the workspace's agent, starting a turn.
	 * `queued` marks a message that had been waiting: it is the first one in the queue.
	 * `steered` marks one that interrupted the agent: it is everything that was steered.
	 */
	| {
			type: 'workspace.message';
			stream: WorkspaceStream;
			data: { id: string; text: string; queued?: boolean; steered?: boolean };
	  }
	/** A message that interrupts the working agent: it is sent as soon as its turn has stopped. */
	| { type: 'workspace.steered'; stream: WorkspaceStream; data: { id: string; text: string } }
	/** A message to send once the agent has finished what it is doing. */
	| { type: 'workspace.queued'; stream: WorkspaceStream; data: { id: string; text: string } }
	/** The workspace got a better name than the first line of its first message. */
	| { type: 'workspace.titled'; stream: WorkspaceStream; data: { id: string; title: string } }
	/** The agent is to run with another model or effort from its next turn on; all of what is chosen. */
	| {
			type: 'workspace.configured';
			stream: WorkspaceStream;
			data: { id: string; settings: AgentSettings };
	  }
	/** The workspace is done with: out of the lists, its worktree gone, its history kept. */
	| { type: 'workspace.archived'; stream: WorkspaceStream; data: { id: string } }
	/** A waiting message was taken back; `index` is its place in the queue at the time. */
	| { type: 'workspace.dequeued'; stream: WorkspaceStream; data: { id: string; index: number } }
	/** Whatever the daemon reports, stored verbatim. */
	| {
			type: 'workspace.output';
			stream: WorkspaceStream;
			data: { id: string; event: AgentEvent };
	  };

export type TranscriptItem =
	| { kind: 'user'; text: string; at: string }
	| { kind: 'text'; text: string; at: string }
	| {
			kind: 'tool';
			id: string;
			name: string;
			input: string;
			output: string | null;
			isError: boolean;
			at: string;
	  }
	| { kind: 'error'; error: string; at: string };

type Status = 'running' | 'idle';

/**
 * A piece of work: one conversation with one agent, in a worktree on its own branch
 * (FDR-001). A workspace started by another workspace's agent may work in that one's
 * worktree instead of its own.
 */
export type Workspace = {
	id: string;
	repoId: string;
	title: string;
	/** Whether someone gave it its title on purpose (its agent, or the agent that started it). */
	named: boolean;
	agent: Agent;
	/** The model and effort it runs with; what is absent is left to the agent's CLI. */
	settings: AgentSettings;
	status: Status;
	/** The workspace whose agent started this one; `null` if a person did. */
	parentId: string | null;
	/** The workspace whose worktree this one works in: its own ID, unless it shares another's. */
	worktreeId: string;
	/** The branch the worktree started from, if not the repository's checked-out one. */
	base: string | null;
	worktree: { path: string; branch: string } | null;
	/** The agent CLI's session ID, for resuming the conversation. */
	resumeId: string | null;
	/** Messages waiting for the agent to finish its turn, in the order they will be sent. */
	queue: string[];
	/** Messages that interrupted the agent and go out as soon as its turn has stopped. */
	steering: string[];
	/** When the workspace was archived; `null` while it is in use. */
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
	transcript: TranscriptItem[];
};

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

/** How often an agent may name its own workspace. */
const MAX_NAMES = 3;

type NewWorkspace = { repoId: string; agent: Agent; settings?: AgentSettings; prompt: string };

export function createWorkspaces(
	store: EventStore<GeordiEvent>,
	repos: ReturnType<typeof createRepos>,
	dispatch: Dispatch,
	{
		limits = { depth: 3, children: 5 },
		secret = randomBytes(32).toString('base64url'),
		onCreated
	}: {
		limits?: Limits;
		/** Signs agent API tokens. Must be the same after a restart, or running agents lose access. */
		secret?: string;
		/** Called with every new workspace and the message that started it, e.g. to name it. */
		onCreated?: (id: string, prompt: string) => void;
	} = {}
) {
	function apply(
		workspaces: Map<string, Workspace>,
		event: CurrentEvent,
		at: string,
		actor: string | null
	) {
		if (event.type === 'workspace.created') {
			const {
				parentId = null,
				worktreeId = event.data.id,
				base = null,
				settings = {},
				...data
			} = event.data;
			workspaces.set(data.id, {
				...data,
				named: false,
				settings,
				status: 'idle',
				parentId,
				worktreeId,
				base,
				worktree: null,
				resumeId: null,
				queue: [],
				steering: [],
				archivedAt: null,
				createdAt: at,
				updatedAt: at,
				transcript: []
			});
			return;
		}

		const workspace = workspaces.get(event.data.id);
		if (!workspace) return;
		workspace.updatedAt = at;
		const { transcript } = workspace;

		if (event.type === 'workspace.titled') {
			workspace.title = event.data.title;
			// a title someone chose, as opposed to one a model made of the first message unasked
			if (actor) workspace.named = true;
			return;
		}
		if (event.type === 'workspace.configured') {
			workspace.settings = event.data.settings;
			return;
		}
		if (event.type === 'workspace.archived') {
			workspace.archivedAt = at;
			workspace.queue = [];
			return;
		}
		if (event.type === 'workspace.queued') {
			workspace.queue.push(event.data.text);
			return;
		}
		if (event.type === 'workspace.dequeued') {
			workspace.queue.splice(event.data.index, 1);
			return;
		}
		if (event.type === 'workspace.steered') {
			workspace.steering.push(event.data.text);
			return;
		}
		if (event.type === 'workspace.message') {
			if (event.data.queued) workspace.queue.shift();
			if (event.data.steered) workspace.steering = [];
			workspace.status = 'running';
			transcript.push({ kind: 'user', text: event.data.text, at });
			return;
		}

		const output = event.data.event;
		switch (output.kind) {
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
				transcript.push({ kind: 'text', text: output.text, at });
				break;
			case 'tool':
				transcript.push({ ...output, output: null, isError: false, at });
				break;
			case 'tool.result': {
				const tool = transcript.findLast((item) => item.kind === 'tool' && item.id === output.id);
				if (tool?.kind === 'tool')
					Object.assign(tool, { output: output.output, isError: output.isError });
				break;
			}
			case 'turn.completed':
				workspace.status = 'idle';
				break;
			case 'turn.failed':
				workspace.status = 'idle';
				// stopped to make way for a steering message: that is not a failure worth showing
				if (!(output.error === 'Stopped' && workspace.steering.length > 0))
					transcript.push({ kind: 'error', error: output.error, at });
				break;
		}
	}

	// Mutates in place (O(1) per event during replay); readers get copies. Events from
	// before a workspace had exactly one conversation are translated first (see legacy.ts).
	const upcast = createUpcaster();
	const projection = store.project(
		'workspaces',
		() => new Map<string, Workspace>(),
		(workspaces, event) => {
			for (const current of upcast(event)) apply(workspaces, current, event.at, event.actor);
			return workspaces;
		}
	);

	function find(id: string): Workspace {
		const workspace = projection.get().get(id);
		if (!workspace) error(404, `Workspace ${id} not found`);
		return workspace;
	}

	/** A workspace as readers see it: a copy, with the worktree it works in filled in. */
	const view = (workspace: Workspace): Workspace => ({
		...structuredClone(workspace),
		worktree: projection.get().get(workspace.worktreeId)?.worktree ?? null
	});
	const summarise = (workspace: Workspace): WorkspaceSummary => {
		const { transcript, ...summary } = view({ ...workspace, transcript: [] });
		void transcript;
		return summary;
	};

	/** What a daemon needs to find the worktree a workspace works in. */
	function ref(id: string): WorktreeRef {
		const { repoId, worktreeId, base } = find(id);
		return { worktreeId, repoPath: repos.get(repoId).path, ...(base && { base }) };
	}

	/**
	 * Records daemon output for a workspace. Unknown workspaces are ignored. When a turn
	 * completes, the next waiting message goes out. After a failed or stopped turn, waiting
	 * messages stay put: sending more into a conversation that just broke would be a guess.
	 *
	 * `turn` says which turn the output is of. Output of a turn that is no longer the
	 * workspace's current one is dropped, and so is the end of a turn that has ended already:
	 * a daemon may say things twice, or late (after we gave a turn up while it was away), and
	 * the end of an old turn must never end the new one.
	 */
	function record(id: string, event: AgentEvent, turn?: number) {
		const workspace = projection.get().get(id);
		if (!workspace) return;
		if (turn !== undefined && turn !== turnsOf(workspace)) return;
		const ends = event.kind === 'turn.completed' || event.kind === 'turn.failed';
		if (ends && workspace.status !== 'running') return;
		store.append({ type: 'workspace.output', stream: `workspace:${id}`, data: { id, event } });
		if (event.kind !== 'turn.completed' && event.kind !== 'turn.failed') return;

		// Whatever steered the agent goes first, however its turn ended.
		if (workspace.steering.length > 0)
			startTurn(workspace, workspace.steering.join('\n\n'), null, 'steered');
		else if (event.kind === 'turn.completed' && workspace.queue.length > 0)
			startTurn(workspace, workspace.queue[0], null, 'queued');
	}

	/** A workspace's turns so far, including a running one. */
	const turnsOf = (workspace: Workspace) =>
		workspace.transcript.filter((item) => item.kind === 'user').length;

	/**
	 * The agent API token for a workspace's current turn. Tokens are derived, not stored: one
	 * is valid exactly while the turn it was made for is running, which the event log knows.
	 * So agents keep their access across a restart of the forge.
	 */
	function tokenFor(workspace: Workspace): string {
		const turn = `${workspace.id}.${turnsOf(workspace)}`;
		return `${turn}.${createHmac('sha256', secret).update(turn).digest('base64url')}`;
	}

	/** The workspace a valid agent API token belongs to, or `null`. */
	function authenticate(token: string): string | null {
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

	/** Appends a message to the workspace's agent and asks a daemon to run the turn. */
	function startTurn(
		workspace: Workspace,
		text: string,
		actor: string | null,
		from?: 'queued' | 'steered'
	) {
		const { id } = workspace;
		store.append(
			{
				type: 'workspace.message',
				stream: `workspace:${id}`,
				data: { id, text, ...(from && { [from]: true }) }
			},
			{ actor }
		);

		const sent = dispatch({
			type: 'turn.start',
			workspaceId: id,
			...ref(id),
			agent: workspace.agent,
			turn: turnsOf(find(id)),
			settings: workspace.settings,
			apiToken: tokenFor(workspace),
			resumeId: workspace.resumeId,
			instructions: instructionsFor({
				parent: (workspace.parentId && projection.get().get(workspace.parentId)) || null,
				sharesWorktree: workspace.worktreeId !== id,
				named: workspace.named,
				mayDelegate: depthOf(workspace) < limits.depth
			}),
			prompt: text
		});
		if (!sent) record(id, { kind: 'turn.failed', error: 'No daemon connected' });
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

	/** Creates a workspace and sends `prompt` to its agent. Returns the workspace's ID. */
	function create(
		{
			prompt,
			settings = {},
			title: given,
			...workspace
		}: NewWorkspace & { parentId?: string; worktreeId?: string; base?: string; title?: string },
		actor: string | null = null
	): string {
		repos.get(workspace.repoId); // 404s for unknown repos
		const chosen = chosenOf(settings);
		const id = randomUUID();
		// The first line; the UI clamps long titles visually.
		const title = prompt.split('\n')[0].trim().slice(0, 300);
		store.append(
			{
				type: 'workspace.created',
				stream: `workspace:${id}`,
				data: {
					id,
					title,
					...workspace,
					...(Object.keys(chosen).length > 0 && { settings: chosen })
				}
			},
			{ actor }
		);
		// whoever starts it may name it; otherwise that is left to others (`onCreated`, its agent)
		if (given && actor) retitle(id, given, actor);
		startTurn(find(id), prompt, actor);
		if (!find(id).named) onCreated?.(id, prompt);
		return id;
	}

	function stop(id: string) {
		if (find(id).status !== 'running') return;
		if (!dispatch({ type: 'turn.stop', workspaceId: id }))
			record(id, { kind: 'turn.failed', error: 'Stopped' });
	}

	// --- Agents starting agents (FDR-002) -------------------------------------------------

	/** How many agents started agents to get to this workspace; 0 if a person started it. */
	function depthOf(workspace: Workspace): number {
		const parent = workspace.parentId && projection.get().get(workspace.parentId);
		return parent ? depthOf(parent) + 1 : 0;
	}

	/** The workspaces a workspace's agent started that are still in use. */
	const childrenOf = (id: string) =>
		[...projection.get().values()].filter(
			(workspace) => workspace.parentId === id && !workspace.archivedAt
		);

	/** Every workspace the given one's agent started, directly or through the agents it started. */
	const descendantsOf = (id: string): Workspace[] =>
		childrenOf(id).flatMap((child) => [child, ...descendantsOf(child.id)]);

	/** A workspace the caller started (directly or not). Anything else doesn't exist for it. */
	function findControlled(callerId: string, id: string): Workspace {
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
		const { transcript } = workspace;
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

	/**
	 * What agents can do through the agent API (ADR-004). Every function takes the calling
	 * workspace, which is also recorded as the actor of what it causes.
	 */
	const agents = {
		authenticate,

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
		 * Starts an agent on the caller's behalf, as a workspace of its own: in a new worktree
		 * branched from the caller's (`own`), or working in the caller's worktree (`shared`).
		 */
		start(
			callerId: string,
			{
				worktree,
				agent,
				prompt,
				title
			}: { worktree: WorktreeMode; agent?: Agent; prompt: string; title?: string }
		): AgentReport {
			const caller = find(callerId);
			if (depthOf(caller) + 1 > limits.depth)
				error(403, `Agents can only be nested ${limits.depth} deep`);
			ensureCapacity(callerId);

			const branch = projection.get().get(caller.worktreeId)?.worktree?.branch;
			if (!branch) error(409, 'Your workspace has no worktree yet');

			const id = create(
				{
					repoId: caller.repoId,
					agent: agent ?? caller.agent,
					// an agent of the same kind runs the way its parent does
					...((agent ?? caller.agent) === caller.agent && { settings: caller.settings }),
					prompt,
					title,
					parentId: callerId,
					...(worktree === 'shared'
						? { worktreeId: caller.worktreeId, ...(caller.base && { base: caller.base }) }
						: { base: branch })
				},
				callerId
			);
			return report(find(id));
		},

		list: (callerId: string): AgentReport[] => descendantsOf(callerId).map(report),

		get: (callerId: string, id: string): AgentReport => report(findControlled(callerId, id)),

		send(callerId: string, id: string, text: string) {
			const workspace = findControlled(callerId, id);
			if (workspace.status === 'running') error(409, 'That agent is still working');
			if (workspace.parentId) ensureCapacity(workspace.parentId);
			startTurn(workspace, text, callerId);
		},

		stop(callerId: string, id: string) {
			stop(findControlled(callerId, id).id);
		},

		/** Resolves once the agent is idle, or after `timeoutMs` at the latest. */
		async wait(callerId: string, id: string, timeoutMs: number): Promise<AgentReport> {
			const workspace = findControlled(callerId, id);
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

	return {
		agents,

		/** All workspaces in use (not archived), newest first, without their transcripts. */
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

		/** The workspaces in use that this one's agent started itself, oldest first. */
		children: (id: string): WorkspaceSummary[] => childrenOf(id).map(summarise),

		/** The IDs of the workspaces in use that this one's agent started, and theirs: parents first. */
		descendants: (id: string): string[] => descendantsOf(id).map((workspace) => workspace.id),
		summary: (id: string): WorkspaceSummary => summarise(find(id)),
		ref,

		/** Starts a workspace with a first message to its agent. Returns the workspace's ID. */
		create: (workspace: NewWorkspace, actor: string | null = null) => create(workspace, actor),

		/**
		 * Says something to the workspace's agent: at once if it is idle (and nothing is
		 * waiting to go first), otherwise once it has finished what it is doing.
		 */
		send(id: string, text: string, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			if (held.has(id)) error(409, 'This workspace is being archived');
			if (workspace.status === 'idle' && workspace.queue.length === 0)
				return startTurn(workspace, text, actor);
			store.append(
				{ type: 'workspace.queued', stream: `workspace:${id}`, data: { id, text } },
				{ actor }
			);
			// idle with messages waiting: the turn before failed, and this is the nudge to go on
			if (workspace.status === 'idle') startTurn(workspace, workspace.queue[0], actor, 'queued');
		},

		/**
		 * Says something to the workspace's agent now: if it is working, its turn is stopped
		 * and the message goes out as soon as it has. Waiting messages keep waiting.
		 */
		steer(id: string, text: string, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			if (held.has(id)) error(409, 'This workspace is being archived');

			if (workspace.status === 'idle') return startTurn(workspace, text, actor);
			store.append(
				{ type: 'workspace.steered', stream: `workspace:${id}`, data: { id, text } },
				{ actor }
			);
			stop(id);
		},

		/**
		 * Takes back a waiting message, by its place in the queue. `text` is the message that
		 * was meant: the queue may have moved on since it was looked at, and then nothing is
		 * taken back rather than the wrong message.
		 */
		dequeue(id: string, index: number, text: string, actor: string | null = null) {
			if (find(id).queue[index] !== text) return;
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
		 * Has the workspace's agent run with another model or effort. A turn under way carries
		 * on as it was started; the next one runs as chosen.
		 */
		configure(id: string, settings: AgentSettings, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.archivedAt) error(409, 'This workspace is archived');
			const chosen = chosenOf(settings);
			const { model, effort } = workspace.settings;
			if (chosen.model === model && chosen.effort === effort) return;
			store.append(
				{ type: 'workspace.configured', stream: `workspace:${id}`, data: { id, settings: chosen } },
				{ actor }
			);
		},

		retitle,

		/**
		 * A title a model made of the workspace's first message. Only until someone has named
		 * it on purpose: its agent knows better what the work is about.
		 */
		suggestTitle(id: string, title: string) {
			if (!find(id).named) retitle(id, title);
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
		 * Called when a daemon (re)connects with the workspaces whose turns it is actually
		 * running. Turns we think are running but the daemon doesn't know about were lost
		 * (e.g. daemon restart). Turns it runs that we have given up (stopped while it was
		 * away, say) are stopped now: no agent works on unseen.
		 */
		reconcile(running: string[]) {
			for (const id of running)
				if (projection.get().get(id)?.status !== 'running')
					dispatch({ type: 'turn.stop', workspaceId: id });
			for (const workspace of projection.get().values())
				if (workspace.status === 'running' && !running.includes(workspace.id))
					record(workspace.id, {
						kind: 'turn.failed',
						error: 'The daemon lost this turn (it may have restarted)'
					});
		}
	};
}
