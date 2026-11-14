/**
 * Messages exchanged between the forge (apps/web) and daemons (apps/daemon).
 * The daemon connects to the forge over a WebSocket; each frame is one JSON message.
 * Both sides authenticate before anything else is exchanged (see `./auth.ts`). See ADR-002.
 */
export const PROTOCOL_VERSION = 5;

export const AGENTS = ['claude', 'codex'] as const;
export type Agent = (typeof AGENTS)[number];

/** Where a workspace lives: its worktree is derived from the repository and the workspace ID. */
export type WorkspaceRef = {
	workspaceId: string;
	repoPath: string;
	/**
	 * The branch the workspace started from, and that its changes are measured against.
	 * Absent for workspaces started from whatever the repository had checked out.
	 */
	base?: string;
};

/** How (and whether) agents can start other agents; see `WORKTREE_MODES`. */
export const WORKTREE_MODES = ['own', 'shared'] as const;
export type WorktreeMode = (typeof WORKTREE_MODES)[number];

/** A file that differs from the workspace's base. Line counts are `null` for binary files. */
export type FileChange = { path: string; added: number | null; removed: number | null };

/** A pull request (or merge request, or whatever the forge calls it) for a workspace's branch. */
export type PullRequest = {
	number: string;
	title: string;
	url: string | null;
	state: 'open' | 'closed' | 'merged' | 'unknown';
	draft: boolean;
	/** The branch it would merge into. */
	base: string | null;
	/** The checks on its latest commit, combined; `null` if there are none. */
	checks: {
		state: 'pending' | 'success' | 'failure' | 'unknown';
		total: number | null;
		failed: number | null;
		url: string | null;
	} | null;
	/** Where its reviews stand, the most decisive first; `null` if nobody was asked. */
	review: 'changes_requested' | 'approved' | 'pending' | null;
};

/**
 * How a workspace's branch stands on the forge its repository is hosted on (GitHub, GitLab,
 * …): the repository's `origin` remote.
 */
export type Upstream = {
	/** The kind of forge, e.g. `github`. */
	forge: string;
	/** The repository there, as `owner/name`. */
	repo: string;
	repoUrl: string | null;
	branch: string;
	/** Whether the branch has been pushed. */
	pushed: boolean;
	/** The page for opening a pull request for the branch, if the forge has one. */
	createUrl: string | null;
	pull: PullRequest | null;
};

/** Questions the forge asks a daemon about a workspace; answered once, never stored. */
export type DaemonRequest =
	/** Every file changed since the workspace branched off, committed or not. */
	| ({ kind: 'changes' } & WorkspaceRef)
	/** The unified diff of one of those files. */
	| ({ kind: 'diff'; path: string } & WorkspaceRef)
	/** The workspace's branch on the repository's upstream forge. */
	| ({ kind: 'upstream' } & WorkspaceRef)
	/** A running terminal's recent output, to catch a new viewer up. */
	| { kind: 'scrollback'; terminalId: string };

export type DaemonResults = {
	changes: FileChange[];
	diff: string;
	/** `null` if the repository has no remote on a forge we know. */
	upstream: Upstream | null;
	/**
	 * `end` is the terminal's output position after `data`: output with a lower `offset` is
	 * already part of it. `null` if the terminal isn't running.
	 */
	scrollback: { data: string; end: number } | null;
};

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
	| ({
			type: 'turn.start';
			sessionId: string;
			agent: Agent;
			/** Lets the agent call Geordi's agent API (ADR-004) as this session, for this turn. */
			apiToken: string;
			/** `null` on the first turn. */
			resumeId: string | null;
			prompt: string;
	  } & WorkspaceRef)
	| { type: 'turn.stop'; sessionId: string }
	| { type: 'request'; id: string; request: DaemonRequest }
	/** Starts a shell in the workspace's directory. A workspace can have several terminals. */
	| ({ type: 'terminal.open'; terminalId: string } & WorkspaceRef & TerminalSize)
	| { type: 'terminal.input'; terminalId: string; data: string }
	| ({ type: 'terminal.resize'; terminalId: string } & TerminalSize)
	/** Ends the shell. */
	| { type: 'terminal.close'; terminalId: string };

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
			/** Terminals currently running on this daemon. */
			terminals: string[];
	  }
	| { type: 'session.event'; sessionId: string; event: SessionEvent }
	/** Answers a `request`, with either a result (see `DaemonResults`) or an error. */
	| { type: 'response'; id: string; result?: unknown; error?: string }
	/** `offset` counts the characters this terminal's shell had put out before `data`. */
	| { type: 'terminal.output'; terminalId: string; data: string; offset: number }
	| { type: 'terminal.exit'; terminalId: string };
