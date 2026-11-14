/**
 * Messages exchanged between the forge (apps/web) and daemons (apps/daemon).
 * The daemon connects to the forge over a WebSocket; each frame is one JSON message.
 * Both sides authenticate before anything else is exchanged (see `./auth.ts`). See ADR-002.
 */
export const PROTOCOL_VERSION = 9;

export const AGENTS = ['claude', 'codex'] as const;
export type Agent = (typeof AGENTS)[number];

/**
 * Where a workspace's files are: a worktree, derived from the repository and an ID. That ID
 * is the workspace's own, unless the workspace works in another one's worktree.
 */
export type WorktreeRef = {
	worktreeId: string;
	repoPath: string;
	/**
	 * The branch the worktree started from, and that its changes are measured against.
	 * Absent for worktrees started from whatever the repository had checked out.
	 */
	base?: string;
};

/** Where an agent started by another agent works: in a worktree of its `own`, or `shared` with its parent. */
export const WORKTREE_MODES = ['own', 'shared'] as const;
export type WorktreeMode = (typeof WORKTREE_MODES)[number];

/** A file that differs from the workspace's base. Line counts are `null` for binary files. */
export type FileChange = { path: string; added: number | null; removed: number | null };

/** What a workspace has changed, and how far that has got. */
export type Changes = {
	/** Every file that differs from where the workspace branched off, committed or not. */
	files: FileChange[];
	/** How many files have changes that are not committed yet. */
	uncommitted: number;
	/** How many commits are not on the remote branch yet; `null` if the branch isn't there at all. */
	unpushed: number | null;
};

/**
 * Both versions of a changed file: where the workspace branched off (`old`) and now (`new`),
 * `null` where the file doesn't exist. Whole files rather than a patch, so that a viewer can
 * show more context around a change on demand. `unavailable` says why there is nothing to show.
 */
export type FileVersions = { old: string | null; new: string | null } | { unavailable: string };

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
	/** What changed since the workspace branched off, and whether it is committed and pushed. */
	| ({ kind: 'changes' } & WorktreeRef)
	/**
	 * Removes the worktree (the branch stays). Refuses if it has uncommitted or untracked
	 * files, unless `force` says to discard them.
	 */
	| ({ kind: 'removeWorktree'; force: boolean } & WorktreeRef)
	/** Both versions of one of those files. */
	| ({ kind: 'diff'; path: string } & WorktreeRef)
	/** The workspace's branch on the repository's upstream forge. */
	| ({ kind: 'upstream' } & WorktreeRef)
	/** A running terminal's recent output, to catch a new viewer up. */
	| { kind: 'scrollback'; terminalId: string };

export type DaemonResults = {
	changes: Changes;
	removeWorktree: null;
	diff: FileVersions;
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
 * What happens in a workspace's conversation with its agent, normalised across agent CLIs.
 * The daemon emits these; the forge stores them verbatim in its event log.
 */
export type AgentEvent =
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
			workspaceId: string;
			agent: Agent;
			/** Lets the agent call Geordi's agent API (ADR-004) as this workspace, for this turn. */
			apiToken: string;
			/** `null` on the first turn. */
			resumeId: string | null;
			prompt: string;
	  } & WorktreeRef)
	| { type: 'turn.stop'; workspaceId: string }
	| { type: 'request'; id: string; request: DaemonRequest }
	/**
	 * The worktrees someone is looking at right now, all of them: the daemon watches their
	 * files and reports changes, and stops watching any that are no longer listed.
	 */
	| { type: 'watch'; worktrees: WorktreeRef[] }
	/** Starts a shell in the workspace's directory. A workspace can have several terminals. */
	| ({ type: 'terminal.open'; terminalId: string } & WorktreeRef & TerminalSize)
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
			/** Workspaces with a turn currently running on this daemon. */
			running: string[];
			/** Terminals currently running on this daemon. */
			terminals: string[];
	  }
	| { type: 'workspace.event'; workspaceId: string; event: AgentEvent }
	/** Answers a `request`, with either a result (see `DaemonResults`) or an error. */
	| { type: 'response'; id: string; result?: unknown; error?: string }
	/** `offset` counts the characters this terminal's shell had put out before `data`. */
	| { type: 'terminal.output'; terminalId: string; data: string; offset: number }
	| { type: 'terminal.exit'; terminalId: string }
	/** Something changed in a watched worktree's files or Git state. */
	| { type: 'worktree.changed'; worktreeId: string };
