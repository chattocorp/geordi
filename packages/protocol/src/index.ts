/**
 * Messages exchanged between the forge (apps/web) and daemons (apps/daemon).
 * The daemon connects to the forge over a WebSocket; each frame is one JSON message.
 * Both sides authenticate before anything else is exchanged (see `./auth.ts`). See ADR-002.
 */
export const PROTOCOL_VERSION = 2;

export const AGENTS = ['claude', 'codex'] as const;
export type Agent = (typeof AGENTS)[number];

/** Where a workspace lives: its worktree is derived from the repository and the workspace ID. */
export type WorkspaceRef = { workspaceId: string; repoPath: string };

/** A file that differs from the workspace's base. Line counts are `null` for binary files. */
export type FileChange = { path: string; added: number | null; removed: number | null };

/** Questions the forge asks a daemon about a workspace; answered once, never stored. */
export type DaemonRequest =
	/** Every file changed since the workspace branched off, committed or not. */
	| ({ kind: 'changes' } & WorkspaceRef)
	/** The unified diff of one of those files. */
	| ({ kind: 'diff'; path: string } & WorkspaceRef);

export type DaemonResults = { changes: FileChange[]; diff: string };

export type TerminalSize = { cols: number; rows: number };

/**
 * What happens in an agent session, normalised across agent CLIs. The daemon emits these;
 * the forge stores them verbatim in its event log.
 */
export type SessionEvent =
	/** The workspace's worktree is ready. */
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
	/** First message on every connection. */
	| { type: 'challenge'; nonce: string }
	/** Reply to a valid `hello`; the daemon trusts the forge only after verifying it. */
	| { type: 'welcome'; proof: string }
	| {
			type: 'turn.start';
			sessionId: string;
			workspaceId: string;
			agent: Agent;
			repoPath: string;
			/** `null` on the first turn. */
			resumeId: string | null;
			prompt: string;
	  }
	| { type: 'turn.stop'; sessionId: string }
	| { type: 'request'; id: string; request: DaemonRequest }
	/** Starts the workspace's shell, or resizes it if it is already running. */
	| ({ type: 'terminal.open' } & WorkspaceRef & TerminalSize)
	| { type: 'terminal.input'; workspaceId: string; data: string }
	| ({ type: 'terminal.resize'; workspaceId: string } & TerminalSize);

/** Daemon → forge. */
export type DaemonMessage =
	| {
			type: 'hello';
			protocol: number;
			daemonId: string;
			/** The daemon's challenge for the forge. */
			nonce: string;
			/** Answer to the forge's challenge. */
			proof: string;
			/** Sessions with a turn currently running on this daemon. */
			running: string[];
	  }
	| { type: 'session.event'; sessionId: string; event: SessionEvent }
	/** Answers a `request`, with either a result (see `DaemonResults`) or an error. */
	| { type: 'response'; id: string; result?: unknown; error?: string }
	| { type: 'terminal.output'; workspaceId: string; data: string }
	| { type: 'terminal.exit'; workspaceId: string };
