/**
 * Messages exchanged between the forge (apps/web) and daemons (apps/daemon).
 * The daemon connects to the forge over a WebSocket; each frame is one JSON message.
 * Both sides authenticate before anything else is exchanged (see `./auth.ts`). See ADR-002.
 */
export const PROTOCOL_VERSION = 22;

export const AGENTS = ['claude', 'codex'] as const;
export type Agent = (typeof AGENTS)[number];

/**
 * How an agent is run, beyond which one it is. Whatever is absent is left to the agent's
 * CLI: its own default, or what the user has configured for it.
 */
export type AgentSettings = {
	/** A model, by the name its CLI knows it by. */
	model?: string;
	/** How hard the model should think; one of the model's `efforts`. */
	effort?: string;
};

/** What model names and effort levels look like. They end up as CLI arguments. */
export const SETTING = /^[A-Za-z0-9][\w.:[\]-]{0,79}$/;

export type Model = {
	id: string;
	name: string;
	/** The effort levels it can be asked for, the least first. */
	efforts: string[];
};

/** What one agent CLI on a daemon's machine can be asked to run. */
export type Harness = {
	agent: Agent;
	models: Model[];
	/** The effort levels to offer while no model is chosen. */
	efforts: string[];
};

/**
 * What a daemon answers when asked about a worktree whose directory isn't there: not made
 * yet, or removed behind Geordi's back.
 */
export const NO_WORKTREE = 'This workspace has no worktree';

/**
 * Where a workspace's files are: a worktree, derived from the repository and an ID. That ID
 * is the workspace's own, unless the workspace works in another one's worktree.
 */
export type WorktreeRef = {
	worktreeId: string;
	repoPath: string;
	/**
	 * The branch the worktree started from, and that its changes are measured against.
	 * Absent for worktrees started from where work in the repository starts.
	 */
	base?: string;
	/**
	 * The branch the worktree is on, as far as the forge knows. Only needed to bring back a
	 * worktree that went missing: one that was continued is no longer on the branch its ID
	 * would say.
	 */
	branch?: string;
};

/** Where an agent started by another agent works: in a worktree of its `own`, or `shared` with its parent. */
export const WORKTREE_MODES = ['own', 'shared'] as const;
export type WorktreeMode = (typeof WORKTREE_MODES)[number];

/** A file that differs from the workspace's base. Line counts are `null` for binary files. */
export type FileChange = {
	path: string;
	/** What became of the file since the workspace branched off, as Git sees it. */
	status: 'added' | 'modified' | 'deleted' | 'renamed';
	/** Where a renamed file was before. */
	from?: string;
	/** Lines added and removed; `null` for a file that isn't text. */
	added: number | null;
	removed: number | null;
};

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
		/**
		 * How many of them stand how; `skipped` are those that neither passed nor failed.
		 * Absent where the forge only says how they stand overall.
		 */
		counts?: { passed: number; failed: number; pending: number; skipped: number };
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

/** A repository says how Geordi should treat it in this file, at its top level. */
export const CONFIG_FILE = '.geordi.toml';

/** How many ports a workspace gets where its repository names no jobs to count, nor a number. */
export const DEFAULT_PORTS = 10;

/**
 * Something a repository can have run for a workspace (FDR-006): a dev server, a database,
 * a desktop app, a game. Each runs in a terminal of its own.
 */
export type Job = {
	name: string;
	command: string;
	/** The jobs that have to be up before this one starts. Stopping one of them stops this one too. */
	needs: string[];
	/**
	 * The port that is this job's in this workspace, for as long as the workspace lives. It
	 * reaches the command as `PORT` (and everything else in the workspace as
	 * `GEORDI_PORT_<NAME>`). A job that listens on it counts as up once it does.
	 */
	port: number;
	/** Whether a person has agreed to run this command in this repository. */
	approved: boolean;
};

/** A place to look at what the jobs serve: a link, with the jobs that have to be up for it to lead anywhere. */
export type Link = {
	name: string;
	/** With the workspace's ports filled in. Always on this machine. */
	href: string;
	needs: string[];
};

/**
 * What a repository's `.geordi.toml` says, as it applies to one workspace: that of the
 * workspace if it has one, otherwise that of the branch work starts from.
 */
export type RepoConfig = {
	jobs: Job[];
	urls: Link[];
	/** The first of the workspace's ports, and how many it has. */
	ports: { first: number; count: number } | null;
	/** What is wrong with the file, if it can't be made sense of. */
	problem: string | null;
	/** Which file this is from: the workspace's own, or the one on the branch work starts from. */
	source: 'workspace' | 'base' | null;
};

/**
 * What a `.geordi.toml` can say, for agents to read (`configuration_reference`). The daemon's
 * parser (`config.ts`) accepts exactly these; a test holds the two together.
 */
export const CONFIG_SETTINGS = {
	run: {
		does: 'The command that runs the project for someone to look at or use: its development server, a desktop app, a game. Short for a single job called `run`. Use this unless the project needs several things running.',
		example: 'run = "pnpm dev --port $PORT"'
	},
	jobs: {
		does: "Several things to run, each a `command` under a name (lower case letters, digits and dashes). `needs` lists the jobs that have to be up first: starting a job starts those, and stopping one stops the jobs that need it. Each job runs in a terminal of its own, in the workspace's directory, and should keep running until stopped.",
		example:
			'[jobs.db]\ncommand = "docker compose up db"\n\n[jobs.web]\ncommand = "pnpm dev --port $PORT"\nneeds = ["db"]'
	},
	urls: {
		does: "Places to open in the browser, each a `url` under a name. `{job}` stands for that job's port. Opening one first starts the jobs it mentions (and any listed under `needs`) and waits for them. Only addresses on this machine (`localhost`).",
		example: '[urls.app]\nurl = "http://localhost:{web}/"'
	},
	ports: {
		does: `How many ports each workspace gets: one per job unless said otherwise (and ${DEFAULT_PORTS} where there are no jobs). Only needed for spare ones, beyond the jobs'. Every job has one port of its own, and it stays the same for as long as the workspace lives: the command gets it as \`PORT\`, and every job's port is in \`GEORDI_PORT_<NAME>\` (upper case, dashes as underscores) for all jobs, terminals and agents of the workspace. \`GEORDI_PORT\` is the first of the workspace's ports and \`GEORDI_PORTS\` how many there are. Never hard-code a port: two workspaces would collide.`,
		example: 'ports = 20'
	}
} as const;

/**
 * The jobs to start so that `names` are up, each after the ones it needs. Names that are
 * not jobs are left out: the file may have changed since they were asked for.
 */
export function startOrder(jobs: Pick<Job, 'name' | 'needs'>[], names: string[]): string[] {
	const byName = new Map(jobs.map((job) => [job.name, job]));
	const order: string[] = [];
	const visit = (name: string, seen: string[]) => {
		const job = byName.get(name);
		// a job that needs itself, however indirectly, is refused when the file is read
		if (!job || order.includes(name) || seen.includes(name)) return;
		for (const needed of job.needs) visit(needed, [...seen, name]);
		order.push(name);
	};
	for (const name of names) visit(name, []);
	return order;
}

/** The jobs that can't go on without `name`: those that need it, and those that need them. */
export function dependentsOf(jobs: Pick<Job, 'name' | 'needs'>[], name: string): string[] {
	const found: string[] = [];
	const visit = (needed: string) => {
		for (const job of jobs)
			if (job.needs.includes(needed) && !found.includes(job.name)) {
				found.push(job.name);
				visit(job.name);
			}
	};
	visit(name);
	return found;
}

/** A job's terminal is named after it, so that it can be told from a shell someone opened. */
export const JOB_TERMINAL = 'run-';
/** Names of jobs and links: they end up in terminal names, and in the names of environment variables. */
export const CONFIG_NAME = /^[a-z][a-z0-9-]{0,30}$/;

/** A note on a change, as a release tool keeps them until the next release: what changed, and how much it matters. */
export type ReleaseNote = {
	/** The note's file, from the top of the repository. */
	path: string;
	/** What kind of change it is, in the tool's (or the repository's) own words: `fix`, `feature`, … */
	type: string;
	breaking: boolean;
	/** What it says, as Markdown. */
	body: string;
	/** Whether this workspace adds it: it is not on the branch the workspace started from. */
	added: boolean;
};

/** One of a repository's packages, as its release tool sees it: where it stands, and where its pending notes take it. */
export type ReleasePackage = {
	/** Its directory, from the top of the repository. */
	path: string;
	name: string | null;
	version: string;
	/** How far the pending notes move the version: `major`, `minor`, `patch`, `none`; the tool's own word otherwise. */
	bump: string;
	/** The version the next release would have; `null` if the tool can't say. */
	nextVersion: string | null;
	notes: ReleaseNote[];
	/** What the tool finds wrong with the package or its notes. */
	problems: string[];
};

/**
 * What a workspace's worktree holds for the repository's next releases (FDR-007), as its
 * release tool reads it: once the workspace is merged, that is what the main branch holds.
 */
export type ReleasePlan = {
	/** Which tool the repository uses, and what it is called. */
	tool: string;
	name: string;
	packages: ReleasePackage[];
	/** Why the tool couldn't be asked, if it couldn't. */
	problem: string | null;
	/**
	 * The command that asks the tool, if nobody has agreed to running it in this repository
	 * yet: it runs as the person, in a directory that is the agent's to write, so it is the
	 * person's to allow (once; see `approveRun`). Until then there is nothing else to show.
	 */
	ask: string | null;
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
	/** A person has seen these commands of the repository's jobs and agreed to run them; the daemon notes that. */
	| ({ kind: 'approveRun'; commands: string[] } & WorktreeRef)
	/**
	 * Waits until something on this machine listens on `port`, for `timeoutMs` at most.
	 * Answers whether something does.
	 */
	| { kind: 'portReady'; port: number; timeoutMs: number }
	/**
	 * Has the workspace carry on with new work (FDR-001): fetches, and moves its worktree to
	 * a new branch off where work in the repository starts. Refused while it has uncommitted
	 * changes. Answers with the new branch.
	 */
	| ({ kind: 'continueWorktree' } & WorktreeRef)
	/**
	 * Makes sure the workspace's worktree is there, without a turn to make it for: a
	 * workspace started without anything to do yet, or one whose worktree was removed
	 * behind Geordi's back (which comes back from its branch). Answers where it is.
	 */
	| ({ kind: 'prepareWorktree' } & WorktreeRef)
	/** What the worktree holds for the repository's next releases; `null` if it uses no release tool we know. */
	| ({ kind: 'release' } & WorktreeRef)
	/** What the repository's configuration says for this workspace. */
	| ({ kind: 'config' } & WorktreeRef)
	/** Both versions of one of those files. */
	| ({ kind: 'diff'; path: string } & WorktreeRef)
	/** The workspace's branch on the repository's upstream forge. */
	| ({
			kind: 'upstream';
			/** Ask the forge now, rather than answer from what was learnt a moment ago. */
			fresh?: boolean;
	  } & WorktreeRef)
	/**
	 * Merges the pull request for the workspace's branch on the upstream forge. Refused
	 * unless it is open and at the very commit the workspace has checked out.
	 */
	| ({ kind: 'mergePull' } & WorktreeRef)
	/** A short title for a piece of work, from the request that starts it. */
	| { kind: 'title'; text: string }
	/** A running terminal's recent output, to catch a new viewer up. */
	| { kind: 'scrollback'; terminalId: string };

export type DaemonResults = {
	changes: Changes;
	removeWorktree: null;
	prepareWorktree: { path: string; branch: string };
	continueWorktree: { branch: string };
	approveRun: null;
	portReady: boolean;
	config: RepoConfig;
	release: ReleasePlan | null;
	title: string;
	diff: FileVersions;
	/** `null` if the repository has no remote on a forge we know. */
	upstream: Upstream | null;
	/** `queued` if the forge merges it later, on its own (a merge queue, say). */
	mergePull: 'merged' | 'queued';
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
			/** Which of the workspace's turns this is, counting from 1. Events say which turn they are of. */
			turn: number;
			settings: AgentSettings;
			/** Lets the agent call Geordi's agent API (ADR-004) as this workspace, for this turn. */
			apiToken: string;
			/** `null` on the first turn. */
			resumeId: string | null;
			/** What the agent is told on top of its CLI's own system prompt: that it works in Geordi, and how. */
			instructions?: string;
			prompt: string;
	  } & WorktreeRef)
	| { type: 'turn.stop'; workspaceId: string }
	| { type: 'request'; id: string; request: DaemonRequest }
	/**
	 * The worktrees someone is looking at right now, all of them: the daemon watches their
	 * files and reports changes, and stops watching any that are no longer listed.
	 */
	| { type: 'watch'; worktrees: WorktreeRef[] }
	/**
	 * Starts a shell in the workspace's directory. A workspace can have several terminals.
	 * With `run`, it runs one of the repository's jobs instead: `command` is that job's
	 * command as the person who asked for it saw it. The daemon runs it only if the file
	 * still says exactly that (the file is the agent's to change at any moment), and only if
	 * a person has agreed to that command (`approveRun`).
	 */
	| ({
			type: 'terminal.open';
			terminalId: string;
			run?: { job: string; command: string };
	  } & WorktreeRef &
			TerminalSize)
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
			/** The models and effort levels this daemon's agent CLIs offer. */
			harnesses: Harness[];
	  }
	/** `turn` is the turn the event is of; absent for turns from before they were numbered. */
	| { type: 'workspace.event'; workspaceId: string; turn?: number; event: AgentEvent }
	/** Answers a `request`, with either a result (see `DaemonResults`) or an error. */
	| { type: 'response'; id: string; result?: unknown; error?: string }
	/** `offset` counts the characters this terminal's shell had put out before `data`. */
	| { type: 'terminal.output'; terminalId: string; data: string; offset: number }
	| { type: 'terminal.exit'; terminalId: string }
	/** Something changed in a watched worktree's files or Git state. */
	| { type: 'worktree.changed'; worktreeId: string };
