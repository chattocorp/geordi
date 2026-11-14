import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { Agent, ForgeMessage, SessionEvent } from '@geordi/protocol';
import type { EventStore, GeordiEvent } from './events/index.ts';
import type { createRepos } from './repos.ts';

type SessionStream = `session:${string}`;

export type SessionsEvent =
	| {
			type: 'session.created';
			stream: SessionStream;
			data: { id: string; repoId: string; agent: Agent; title: string };
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

export type Session = {
	id: string;
	repoId: string;
	agent: Agent;
	title: string;
	status: 'running' | 'idle';
	worktree: { path: string; branch: string } | null;
	/** The agent CLI's session ID, for resuming the conversation. */
	resumeId: string | null;
	createdAt: string;
	updatedAt: string;
	transcript: TranscriptItem[];
};

export type SessionSummary = Omit<Session, 'transcript'>;

/** Sends a message to a daemon; returns false if none is connected. */
export type Dispatch = (message: ForgeMessage) => boolean;

function applyOutput(session: Session, event: SessionEvent, at: string) {
	const { transcript } = session;
	switch (event.kind) {
		case 'worktree':
			session.worktree = { path: event.path, branch: event.branch };
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

export function createSessions(
	store: EventStore<GeordiEvent>,
	repos: ReturnType<typeof createRepos>,
	dispatch: Dispatch
) {
	// Mutates in place (O(1) per event during replay); readers get copies.
	const projection = store.project(
		'sessions',
		() => new Map<string, Session>(),
		(sessions, event) => {
			if (event.type === 'session.created') {
				const { at } = event;
				sessions.set(event.data.id, {
					...event.data,
					status: 'idle',
					worktree: null,
					resumeId: null,
					createdAt: at,
					updatedAt: at,
					transcript: []
				});
				return sessions;
			}

			if (event.type !== 'session.message' && event.type !== 'session.output') return sessions;
			const session = sessions.get(event.data.id);
			if (!session) return sessions;

			session.updatedAt = event.at;
			if (event.type === 'session.message') {
				session.status = 'running';
				session.transcript.push({ kind: 'user', text: event.data.text, at: event.at });
			} else {
				applyOutput(session, event.data.event, event.at);
			}
			return sessions;
		}
	);

	function find(id: string): Session {
		const session = projection.get().get(id);
		if (!session) error(404, `Session ${id} not found`);
		return session;
	}

	/** Records daemon output for a session. Unknown sessions are ignored. */
	function record(id: string, event: SessionEvent) {
		if (!projection.get().has(id)) return;
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
			agent: session.agent,
			repoPath: repos.get(session.repoId).path,
			resumeId: session.resumeId,
			prompt: text
		});
		if (!sent) record(id, { kind: 'turn.failed', error: 'No daemon connected' });
	}

	return {
		/** Sessions of a repository, newest first, without transcripts. */
		list(repoId: string): SessionSummary[] {
			return [...projection.get().values()]
				.filter((session) => session.repoId === repoId)
				.reverse()
				.map(({ transcript, ...summary }) => ({ ...summary }));
		},

		get: (id: string): Session => structuredClone(find(id)),

		create(
			{ repoId, agent, prompt }: { repoId: string; agent: Agent; prompt: string },
			actor: string | null = null
		) {
			repos.get(repoId); // 404s for unknown repos
			const id = randomUUID();
			// The first line; the UI clamps long titles visually.
			const title = prompt.split('\n')[0].trim().slice(0, 300);
			store.append(
				{ type: 'session.created', stream: `session:${id}`, data: { id, repoId, agent, title } },
				{ actor }
			);
			startTurn(find(id), prompt, actor);
			return id;
		},

		send(id: string, text: string, actor: string | null = null) {
			const session = find(id);
			if (session.status === 'running') error(409, 'The agent is still working');
			startTurn(session, text, actor);
		},

		stop(id: string) {
			const session = find(id);
			if (session.status !== 'running') return;
			if (!dispatch({ type: 'turn.stop', sessionId: id }))
				record(id, { kind: 'turn.failed', error: 'Stopped' });
		},

		record,

		/**
		 * Called when a daemon (re)connects with the sessions it is actually running. Turns we
		 * think are running but the daemon doesn't know about were lost (e.g. daemon restart).
		 */
		reconcile(running: string[]) {
			for (const session of projection.get().values())
				if (session.status === 'running' && !running.includes(session.id))
					record(session.id, {
						kind: 'turn.failed',
						error: 'The daemon lost this turn (it may have restarted)'
					});
		}
	};
}
