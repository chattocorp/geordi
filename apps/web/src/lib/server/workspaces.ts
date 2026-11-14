import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { Agent, ForgeMessage, SessionEvent, WorkspaceRef } from '@geordi/protocol';
import type { EventStore, GeordiEvent } from './events/index.ts';
import type { createRepos } from './repos.ts';

type WorkspaceStream = `workspace:${string}`;
type SessionStream = `session:${string}`;

export type WorkspacesEvent =
	| {
			type: 'workspace.created';
			stream: WorkspaceStream;
			data: { id: string; repoId: string; title: string };
	  }
	| {
			type: 'session.created';
			stream: SessionStream;
			/**
			 * Sessions from before workspaces existed carry `repoId` instead of `workspaceId`.
			 * Each becomes a workspace of its own with the session's ID, which is also what its
			 * worktree is named after.
			 */
			data: { id: string; agent: Agent; title: string; workspaceId?: string; repoId?: string };
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
	worktree: { path: string; branch: string } | null;
	createdAt: string;
	updatedAt: string;
	sessions: Session[];
};

export type WorkspaceSummary = Omit<Workspace, 'sessions'> & { status: Status; agents: Agent[] };

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
	dispatch: Dispatch
) {
	// Mutates in place (O(1) per event during replay); readers get copies. Sessions are
	// indexed by ID as well; a workspace's `sessions` holds the same objects.
	const projection = store.project(
		'workspaces',
		() => ({ workspaces: new Map<string, Workspace>(), sessions: new Map<string, Session>() }),
		(state, event) => {
			const { workspaces, sessions } = state;
			const { at } = event;
			const addWorkspace = (data: { id: string; repoId: string; title: string }) =>
				workspaces.set(data.id, {
					...data,
					worktree: null,
					createdAt: at,
					updatedAt: at,
					sessions: []
				});

			if (event.type === 'workspace.created') {
				addWorkspace(event.data);
			} else if (event.type === 'session.created') {
				const { id, agent, title, repoId, workspaceId = id } = event.data;
				if (repoId) addWorkspace({ id, repoId, title });
				const session: Session = {
					id,
					workspaceId,
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
		return { workspaceId: id, repoPath: repos.get(find(id).repoId).path };
	}

	/** Records daemon output for a session. Unknown sessions are ignored. */
	function record(id: string, event: SessionEvent) {
		if (!projection.get().sessions.has(id)) return;
		store.append({ type: 'session.output', stream: `session:${id}`, data: { id, event } });
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
		actor: string | null = null
	) {
		find(workspaceId);
		const id = randomUUID();
		store.append(
			{
				type: 'session.created',
				stream: `session:${id}`,
				data: { id, workspaceId, agent, title: titleOf(prompt) }
			},
			{ actor }
		);
		startTurn(findSession(id), prompt, actor);
		return id;
	}

	return {
		/** Workspaces of a repository, newest first, without their sessions. */
		list(repoId: string): WorkspaceSummary[] {
			return [...projection.get().workspaces.values()]
				.filter((workspace) => workspace.repoId === repoId)
				.reverse()
				.map(({ sessions, ...workspace }) => ({
					...workspace,
					status: statusOf({ ...workspace, sessions }),
					agents: [...new Set(sessions.map((session) => session.agent))]
				}));
		},

		get: (id: string): Workspace => structuredClone(find(id)),
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

		stop(sessionId: string) {
			if (findSession(sessionId).status !== 'running') return;
			if (!dispatch({ type: 'turn.stop', sessionId }))
				record(sessionId, { kind: 'turn.failed', error: 'Stopped' });
		},

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
