/**
 * Messages exchanged between the forge (apps/web) and daemons (apps/daemon).
 * The daemon connects to the forge over a WebSocket; each frame is one JSON message.
 * See ADR-002.
 */
export const PROTOCOL_VERSION = 1;

export const AGENTS = ['claude', 'codex'] as const;
export type Agent = (typeof AGENTS)[number];

/**
 * What happens in an agent session, normalised across agent CLIs. The daemon emits these;
 * the forge stores them verbatim in its event log.
 */
export type SessionEvent =
	/** The session's worktree is ready. */
	| { kind: 'worktree'; path: string; branch: string }
	/** The agent CLI's own session ID, needed to resume the conversation in the next turn. */
	| { kind: 'resume'; id: string }
	| { kind: 'text'; text: string }
	| { kind: 'tool'; id: string; name: string; input: string }
	| { kind: 'tool.result'; id: string; output: string; isError: boolean }
	/** Every turn ends with exactly one of these two. */
	| { kind: 'turn.completed' }
	| { kind: 'turn.failed'; error: string };

/** Forge → daemon. */
export type ForgeMessage =
	| {
			type: 'turn.start';
			sessionId: string;
			agent: Agent;
			repoPath: string;
			/** `null` on the first turn. */
			resumeId: string | null;
			prompt: string;
	  }
	| { type: 'turn.stop'; sessionId: string };

/** Daemon → forge. */
export type DaemonMessage =
	| {
			type: 'hello';
			protocol: number;
			/** Shared secret issued by the forge (stored in its data directory). */
			token: string;
			daemonId: string;
			/** Sessions with a turn currently running on this daemon. */
			running: string[];
	  }
	| { type: 'session.event'; sessionId: string; event: SessionEvent };
