import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type {
	Agent,
	ForgeMessage,
	SessionEvent,
	WorkspaceRef,
	WorktreeMode
} from '@geordi/protocol';
import type { EventStore, GeordiEvent } from './events/index.ts';
import type { createRepos } from './repos.ts';

type WorkspaceStream = `workspace:${string}`;
type SessionStream = `session:${string}`;

export type WorkspacesEvent =
	| {
			type: 'workspace.created';
			stream: WorkspaceStream;
			/**
			 * Workspaces started by an agent (FDR-002) record that session as their parent, and
			 * the branch they start from: the parent workspace's.
			 */
			data: {
				id: string;
				repoId: string;
				title: string;
				parentSessionId?: string;
				base?: string;
			};
	  }
	| {
			type: 'session.created';
			stream: SessionStream;
			/**
			 * Sessions from before workspaces existed carry `repoId` instead of `workspaceId`.
			 * Each becomes a workspace of its own with the session's ID, which is also what its
			 * worktree is named after.
			 */
			data: {
				id: string;
				agent: Agent;
				title: string;
				workspaceId?: string;
				repoId?: string;
				/** The session that started this one through the agent API, if any. */
				parentSessionId?: string;
			};
	  }
	| { type: 'session.message'; stream: SessionStream; data: { id: string; text: string } }
	/** Whatever the daemon reports, stored verbatim. */
	| { type: 'session.output'; stream: SessionStream; data: { id: string; event: SessionEvent } };

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

/** One conversation with an agent, inside a workspace. */
export type Session = {
	id: string;
	workspaceId: string;
	/** The session that started this one (FDR-002); `null` if a person did. */
	parentSessionId: string | null;
	agent: Agent;
	title: string;
	status: Status;
	/** The agent CLI's session ID, for resuming the conversation. */
	resumeId: string | null;
	createdAt: string;
	updatedAt: string;
	transcript: TranscriptItem[];
};

/** A worktree on its own branch, and the agent sessions working in it. */
export type Workspace = {
	id: string;
	repoId: string;
	title: string;
	/** The session (in another workspace) that started this workspace; `null` if a person did. */
	parentSessionId: string | null;
	/** The workspace that session is in. */
	parentWorkspaceId: string | null;
	/** The branch this workspace started from, if not the repository's checked-out one. */
	base: string | null;
	worktree: { path: string; branch: string } | null;
	createdAt: string;
	updatedAt: string;
	sessions: Session[];
};

export type WorkspaceSummary = Omit<Workspace, 'sessions'> & { status: Status; agents: Agent[] };

/** What an agent sees of an agent it started (FDR-002). */
export type AgentReport = {
	sessionId: string;
	workspaceId: string;
	parentSessionId: string | null;
	agent: Agent;
	title: string;
	status: Status;
	/** The branch the agent works on, once its worktree exists. */
	branch: string | null;
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

const statusOf = (workspace: Workspace): Status =>
	workspace.sessions.some((session) => session.status === 'running') ? 'running' : 'idle';

function applyOutput(workspace: Workspace, session: Session, event: SessionEvent, at: string) {
	const { transcript } = session;
	switch (event.kind) {
		case 'worktree':
			workspace.worktree = { path: event.path, branch: event.branch };
			break;
		case 'resume':
			session.resumeId = event.id;
			break;
		case 'text':
			transcript.push({ kind: 'text', text: event.text, at });
			break;
		case 'tool':
			transcript.push({ ...event, output: null, isError: false, at });
			break;
		case 'tool.result': {
			const tool = transcript.findLast((item) => item.kind === 'tool' && item.id === event.id);
			if (tool?.kind === 'tool')
				Object.assign(tool, { output: event.output, isError: event.isError });
			break;
		}
		case 'turn.completed':
			session.status = 'idle';
			break;
		case 'turn.failed':
			session.status = 'idle';
			transcript.push({ kind: 'error', error: event.error, at });
			break;
	}
}

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
	// Mutates in place (O(1) per event during replay); readers get copies. Sessions are
	// indexed by ID as well; a workspace's `sessions` holds the same objects.
	const projection = store.project(
		'workspaces',
		() => ({ workspaces: new Map<string, Workspace>(), sessions: new Map<string, Session>() }),
		(state, event) => {
			const { workspaces, sessions } = state;
			const { at } = event;
			const addWorkspace = (
				data: Extract<WorkspacesEvent, { type: 'workspace.created' }>['data']
			) =>
				workspaces.set(data.id, {
					...data,
					parentSessionId: data.parentSessionId ?? null,
					parentWorkspaceId:
						(data.parentSessionId && sessions.get(data.parentSessionId)?.workspaceId) || null,
					base: data.base ?? null,
					worktree: null,
					createdAt: at,
					updatedAt: at,
					sessions: []
				});

			if (event.type === 'workspace.created') {
				addWorkspace(event.data);
			} else if (event.type === 'session.created') {
				const { id, agent, title, repoId, workspaceId = id, parentSessionId = null } = event.data;
				if (repoId) addWorkspace({ id, repoId, title });
				const session: Session = {
					id,
					workspaceId,
					parentSessionId,
					agent,
					title,
					status: 'idle',
					resumeId: null,
					createdAt: at,
					updatedAt: at,
					transcript: []
				};
				sessions.set(id, session);
				workspaces.get(workspaceId)?.sessions.push(session);
			} else if (event.type === 'session.message' || event.type === 'session.output') {
				const session = sessions.get(event.data.id);
				const workspace = session && workspaces.get(session.workspaceId);
				if (!workspace) return state;

				session.updatedAt = workspace.updatedAt = at;
				if (event.type === 'session.message') {
					session.status = 'running';
					session.transcript.push({ kind: 'user', text: event.data.text, at });
				} else {
					applyOutput(workspace, session, event.data.event, at);
				}
			}
			return state;
		}
	);

	function find(id: string): Workspace {
		const workspace = projection.get().workspaces.get(id);
		if (!workspace) error(404, `Workspace ${id} not found`);
		return workspace;
	}

	function findSession(id: string): Session {
		const session = projection.get().sessions.get(id);
		if (!session) error(404, `Session ${id} not found`);
		return session;
	}

	/** What a daemon needs to find the workspace's worktree. */
	function ref(id: string): WorkspaceRef {
		const { repoId, base } = find(id);
		return { workspaceId: id, repoPath: repos.get(repoId).path, ...(base && { base }) };
	}

	/** Records daemon output for a session. Unknown sessions are ignored. */
	function record(id: string, event: SessionEvent) {
		if (!projection.get().sessions.has(id)) return;
		store.append({ type: 'session.output', stream: `session:${id}`, data: { id, event } });
	}

	/** A session's turns so far, including a running one. */
	const turnsOf = (session: Session) =>
		session.transcript.filter((item) => item.kind === 'user').length;

	/**
	 * The agent API token for a session's current turn. Tokens are derived, not stored: one is
	 * valid exactly while the turn it was made for is running, which the event log knows. So
	 * agents keep their access across a restart of the forge.
	 */
	function tokenFor(session: Session): string {
		const turn = `${session.id}.${turnsOf(session)}`;
		return `${turn}.${createHmac('sha256', secret).update(turn).digest('base64url')}`;
	}

	/** The session a valid agent API token belongs to, or `null`. */
	function authenticate(token: string): string | null {
		const session = projection.get().sessions.get(token.split('.')[0]);
		if (session?.status !== 'running') return null;
		const expected = Buffer.from(tokenFor(session));
		const given = Buffer.from(token);
		return given.length === expected.length && timingSafeEqual(given, expected) ? session.id : null;
	}

	/** Appends the user's message and asks a daemon to run the turn. */
	function startTurn(session: Session, text: string, actor: string | null) {
		const { id } = session;
		store.append(
			{ type: 'session.message', stream: `session:${id}`, data: { id, text } },
			{ actor }
		);

		const sent = dispatch({
			type: 'turn.start',
			sessionId: id,
			...ref(session.workspaceId),
			agent: session.agent,
			apiToken: tokenFor(session),
			resumeId: session.resumeId,
			prompt: text
		});
		if (!sent) record(id, { kind: 'turn.failed', error: 'No daemon connected' });
	}

	// The first line; the UI clamps long titles visually.
	const titleOf = (prompt: string) => prompt.split('\n')[0].trim().slice(0, 300);

	type NewSession = { agent: Agent; prompt: string };

	/** Starts a new agent session in a workspace, with `prompt` as its first message. */
	function addSession(
		workspaceId: string,
		{ agent, prompt }: NewSession,
		actor: string | null = null,
		parentSessionId?: string
	) {
		find(workspaceId);
		const id = randomUUID();
		store.append(
			{
				type: 'session.created',
				stream: `session:${id}`,
				data: { id, workspaceId, agent, title: titleOf(prompt), parentSessionId }
			},
			{ actor }
		);
		startTurn(findSession(id), prompt, actor);
		return id;
	}

	// --- Agents starting agents (FDR-002) -------------------------------------------------

	/** How many agents started agents to get to this session; 0 for sessions people started. */
	function depthOf(session: Session): number {
		const parent =
			session.parentSessionId && projection.get().sessions.get(session.parentSessionId);
		return parent ? depthOf(parent) + 1 : 0;
	}

	/** Every session the given one started, directly or through the agents it started. */
	function descendantsOf(sessionId: string): Session[] {
		const children = [...projection.get().sessions.values()].filter(
			(session) => session.parentSessionId === sessionId
		);
		return children.flatMap((child) => [child, ...descendantsOf(child.id)]);
	}

	/** A session the caller started (directly or not). Anything else doesn't exist for it. */
	function findControlled(callerId: string, sessionId: string): Session {
		const session = descendantsOf(callerId).find((candidate) => candidate.id === sessionId);
		if (!session) error(404, `You have not started an agent with session ID ${sessionId}`);
		return session;
	}

	/** Refuses to set another of a session's agents to work while too many already are. */
	function ensureCapacity(parentId: string) {
		const running = [...projection.get().sessions.values()].filter(
			(child) => child.parentSessionId === parentId && child.status === 'running'
		);
		if (running.length >= limits.children)
			error(429, `${limits.children} agents are already running; wait for one to finish`);
	}

	function report(session: Session): AgentReport {
		const turn = session.transcript.slice(
			session.transcript.findLastIndex((item) => item.kind === 'user') + 1
		);
		const texts = turn.flatMap((item) => (item.kind === 'text' ? [item.text] : []));
		return {
			sessionId: session.id,
			workspaceId: session.workspaceId,
			parentSessionId: session.parentSessionId,
			agent: session.agent,
			title: session.title,
			status: session.status,
			branch: find(session.workspaceId).worktree?.branch ?? null,
			reply: texts.join('\n\n'),
			error: turn.findLast((item) => item.kind === 'error')?.error ?? null
		};
	}

	/**
	 * What agents can do through the agent API (ADR-004). Every function takes the calling
	 * session, which is also recorded as the actor of what it causes.
	 */
	const agents = {
		authenticate,

		/**
		 * Starts an agent on the caller's behalf: in the caller's workspace (`shared`), or in
		 * a new workspace branched from the caller's (`own`).
		 */
		start(
			callerId: string,
			{ worktree, agent, prompt }: { worktree: WorktreeMode; agent?: Agent; prompt: string }
		): AgentReport {
			const caller = findSession(callerId);
			const workspace = find(caller.workspaceId);
			const session = { agent: agent ?? caller.agent, prompt };

			if (depthOf(caller) + 1 > limits.depth)
				error(403, `Agents can only be nested ${limits.depth} deep`);
			ensureCapacity(callerId);

			if (worktree === 'shared')
				return report(findSession(addSession(workspace.id, session, callerId, callerId)));

			if (!workspace.worktree) error(409, 'Your workspace has no worktree yet');
			const id = randomUUID();
			store.append(
				{
					type: 'workspace.created',
					stream: `workspace:${id}`,
					data: {
						id,
						repoId: workspace.repoId,
						title: titleOf(prompt),
						parentSessionId: callerId,
						base: workspace.worktree.branch
					}
				},
				{ actor: callerId }
			);
			return report(findSession(addSession(id, session, callerId, callerId)));
		},

		list: (callerId: string): AgentReport[] => descendantsOf(callerId).map(report),

		get: (callerId: string, sessionId: string): AgentReport =>
			report(findControlled(callerId, sessionId)),

		send(callerId: string, sessionId: string, text: string) {
			const session = findControlled(callerId, sessionId);
			if (session.status === 'running') error(409, 'That agent is still working');
			if (session.parentSessionId) ensureCapacity(session.parentSessionId);
			startTurn(session, text, callerId);
		},

		stop(callerId: string, sessionId: string) {
			stop(findControlled(callerId, sessionId).id);
		},

		/** Resolves once the agent is idle, or after `timeoutMs` at the latest. */
		async wait(callerId: string, sessionId: string, timeoutMs: number): Promise<AgentReport> {
			const session = findControlled(callerId, sessionId);
			if (session.status === 'running')
				await new Promise<void>((resolve) => {
					const done = () => {
						clearTimeout(timeout);
						unsubscribe();
						resolve();
					};
					const timeout = setTimeout(done, timeoutMs);
					const unsubscribe = store.subscribe(() => session.status === 'idle' && done());
				});
			return report(session);
		}
	};

	function stop(sessionId: string) {
		if (findSession(sessionId).status !== 'running') return;
		if (!dispatch({ type: 'turn.stop', sessionId }))
			record(sessionId, { kind: 'turn.failed', error: 'Stopped' });
	}

	const summarise = ({ sessions, ...workspace }: Workspace): WorkspaceSummary => ({
		...workspace,
		status: statusOf({ ...workspace, sessions }),
		agents: [...new Set(sessions.map((session) => session.agent))]
	});

	return {
		agents,

		/** All workspaces, newest first, without their sessions. */
		all: (): WorkspaceSummary[] =>
			[...projection.get().workspaces.values()].reverse().map(summarise),

		/** Workspaces of a repository, newest first, without their sessions. */
		list(repoId: string): WorkspaceSummary[] {
			return [...projection.get().workspaces.values()]
				.filter((workspace) => workspace.repoId === repoId)
				.reverse()
				.map(summarise);
		},

		get: (id: string): Workspace => structuredClone(find(id)),
		summary: (id: string): WorkspaceSummary => summarise(find(id)),
		ref,

		/** Creates a workspace and its first session. Returns the workspace's ID. */
		create({ repoId, ...session }: NewSession & { repoId: string }, actor: string | null = null) {
			repos.get(repoId); // 404s for unknown repos
			const id = randomUUID();
			store.append(
				{
					type: 'workspace.created',
					stream: `workspace:${id}`,
					data: { id, repoId, title: titleOf(session.prompt) }
				},
				{ actor }
			);
			addSession(id, session, actor);
			return id;
		},

		addSession,

		send(sessionId: string, text: string, actor: string | null = null) {
			const session = findSession(sessionId);
			if (session.status === 'running') error(409, 'The agent is still working');
			startTurn(session, text, actor);
		},

		stop,

		record,

		/**
		 * Called when a daemon (re)connects with the sessions it is actually running. Turns we
		 * think are running but the daemon doesn't know about were lost (e.g. daemon restart).
		 */
		reconcile(running: string[]) {
			for (const session of projection.get().sessions.values())
				if (session.status === 'running' && !running.includes(session.id))
					record(session.id, {
						kind: 'turn.failed',
						error: 'The daemon lost this turn (it may have restarted)'
					});
		}
	};
}
