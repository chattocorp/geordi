import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { Agent, AgentEvent, ForgeMessage, WorktreeMode, WorktreeRef } from '@geordi/protocol';
import type { EventStore, GeordiEvent } from './events/index.ts';
import { createUpcaster, type CurrentEvent } from './legacy.ts';
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
				/** The workspace whose agent started this one (FDR-002). */
				parentId?: string;
				/** The workspace whose worktree this one works in, if not its own. */
				worktreeId?: string;
				/** The branch its worktree starts from, if not the repository's checked-out one. */
				base?: string;
			};
	  }
	/** Something the user (or another agent) said to the workspace's agent. */
	| { type: 'workspace.message'; stream: WorkspaceStream; data: { id: string; text: string } }
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
	agent: Agent;
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

type NewWorkspace = { repoId: string; agent: Agent; prompt: string };

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
	function apply(workspaces: Map<string, Workspace>, event: CurrentEvent, at: string) {
		if (event.type === 'workspace.created') {
			const { parentId = null, worktreeId = event.data.id, base = null, ...data } = event.data;
			workspaces.set(data.id, {
				...data,
				status: 'idle',
				parentId,
				worktreeId,
				base,
				worktree: null,
				resumeId: null,
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

		if (event.type === 'workspace.message') {
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
			for (const current of upcast(event)) apply(workspaces, current, event.at);
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

	/** Records daemon output for a workspace. Unknown workspaces are ignored. */
	function record(id: string, event: AgentEvent) {
		if (!projection.get().has(id)) return;
		store.append({ type: 'workspace.output', stream: `workspace:${id}`, data: { id, event } });
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

	/** Appends a message to the workspace's agent and asks a daemon to run the turn. */
	function startTurn(workspace: Workspace, text: string, actor: string | null) {
		const { id } = workspace;
		store.append(
			{ type: 'workspace.message', stream: `workspace:${id}`, data: { id, text } },
			{ actor }
		);

		const sent = dispatch({
			type: 'turn.start',
			workspaceId: id,
			...ref(id),
			agent: workspace.agent,
			apiToken: tokenFor(workspace),
			resumeId: workspace.resumeId,
			prompt: text
		});
		if (!sent) record(id, { kind: 'turn.failed', error: 'No daemon connected' });
	}

	/** Creates a workspace and sends `prompt` to its agent. Returns the workspace's ID. */
	function create(
		{
			prompt,
			...workspace
		}: NewWorkspace & { parentId?: string; worktreeId?: string; base?: string },
		actor: string | null = null
	): string {
		repos.get(workspace.repoId); // 404s for unknown repos
		const id = randomUUID();
		// The first line; the UI clamps long titles visually.
		const title = prompt.split('\n')[0].trim().slice(0, 300);
		store.append(
			{ type: 'workspace.created', stream: `workspace:${id}`, data: { id, title, ...workspace } },
			{ actor }
		);
		startTurn(find(id), prompt, actor);
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

	const childrenOf = (id: string) =>
		[...projection.get().values()].filter((workspace) => workspace.parentId === id);

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
		 * Starts an agent on the caller's behalf, as a workspace of its own: in a new worktree
		 * branched from the caller's (`own`), or working in the caller's worktree (`shared`).
		 */
		start(
			callerId: string,
			{ worktree, agent, prompt }: { worktree: WorktreeMode; agent?: Agent; prompt: string }
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
					prompt,
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

		/** All workspaces, newest first, without their transcripts. */
		all: (): WorkspaceSummary[] => [...projection.get().values()].reverse().map(summarise),

		/** Workspaces of a repository, newest first, without their transcripts. */
		list: (repoId: string): WorkspaceSummary[] =>
			[...projection.get().values()]
				.filter((workspace) => workspace.repoId === repoId)
				.reverse()
				.map(summarise),

		get: (id: string): Workspace => view(find(id)),
		summary: (id: string): WorkspaceSummary => summarise(find(id)),
		ref,

		/** Starts a workspace with a first message to its agent. Returns the workspace's ID. */
		create: (workspace: NewWorkspace, actor: string | null = null) => create(workspace, actor),

		send(id: string, text: string, actor: string | null = null) {
			const workspace = find(id);
			if (workspace.status === 'running') error(409, 'The agent is still working');
			startTurn(workspace, text, actor);
		},

		stop,
		record,

		/**
		 * Called when a daemon (re)connects with the workspaces whose turns it is actually
		 * running. Turns we think are running but the daemon doesn't know about were lost
		 * (e.g. daemon restart).
		 */
		reconcile(running: string[]) {
			for (const workspace of projection.get().values())
				if (workspace.status === 'running' && !running.includes(workspace.id))
					record(workspace.id, {
						kind: 'turn.failed',
						error: 'The daemon lost this turn (it may have restarted)'
					});
		}
	};
}
