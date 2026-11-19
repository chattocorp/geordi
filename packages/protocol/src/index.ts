export {
	IMAGE_TYPES,
	MAX_IMAGE_BYTES,
	MAX_IMAGES,
	imageTypeOf,
	pictureTypeOf,
	type ImageType,
	type MessageImage,
	type Picture,
	type PictureType
} from './images.ts';
import type { MessageImage, Picture } from './images.ts';
/**
 * Messages exchanged between the forge (apps/web) and daemons (apps/daemon).
 * The daemon connects to the forge over a WebSocket; each frame is one JSON message.
 * Both sides authenticate before anything else is exchanged (see `./auth.ts`). See ADR-002.
 */
export const PROTOCOL_VERSION = 35;

export const AGENTS = ['claude', 'codex'] as const;
export type Agent = (typeof AGENTS)[number];

export const PERMISSION_MODES = ['auto', 'full-access'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

/** The settings a workspace sends with each turn. */
export type AgentSettings = {
	/** Existing workspaces can have no recorded permission choice. */
	permissionMode?: PermissionMode;
	/** A model, by the name its CLI knows it by. */
	model?: string;
	/** How hard the model should think; one of the model's `efforts`. */
	effort?: string;
};

export function sameAgentSettings(a: AgentSettings, b: AgentSettings): boolean {
	return a.model === b.model && a.effort === b.effort && a.permissionMode === b.permissionMode;
}

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
	 * The branch the worktree started from.
	 * Absent for worktrees started from where work in the repository starts.
	 */
	base?: string;
	/** Branches this workspace was built on, nearest parent first. */
	parents?: { worktreeId: string; branch: string }[];
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

/** Which of the forge's lists of worktrees to watch a `watch` message replaces. */
export type WatchScope = 'open' | 'background';

/** What a workspace has changed, and how far that has got. */
export type Changes = {
	/**
	 * The branch the worktree is on; `null` if it is on none (a detached HEAD). Not always the
	 * one Geordi made: the agent may rename it, or switch to another.
	 */
	branch: string | null;
	/** The branch used for the file comparison. */
	comparisonTarget?: string;
	/** Every file that differs from the merge base with that target, committed or not. */
	files: FileChange[];
	/** How many files have changes that are not committed yet. */
	uncommitted: number;
	/** How many commits are not on the remote branch yet; `null` if the branch isn't there at all. */
	unpushed: number | null;
	/**
	 * Whether the branch's own commits are all in the branch it started from by now: its
	 * work was merged there (by the agent that started this one, say), and nothing differs
	 * any more. Not so for a branch nothing was ever committed on.
	 */
	landed: boolean;
	/** Whether HEAD contains commits outside the base branch, including empty commits. */
	unmerged?: boolean;
	/** Known commits in the base branch that this workspace does not contain. */
	incoming?: { branch: string; commits: number } | null;
};

/**
 * Both versions of a changed file: where the workspace branched off (`old`) and now (`new`),
 * `null` where the file doesn't exist. Whole files rather than a patch, so that a viewer can
 * show more context around a change on demand. `unavailable` says why there is nothing to show.
 */
export type FileVersions = { old: string | null; new: string | null } | { unavailable: string };

export type CheckCounts = { passed: number; failed: number; pending: number; skipped: number };

export type PullCheck = {
	id: string;
	name: string;
	state: 'pending' | 'success' | 'failure' | 'neutral' | 'unknown';
	/** More precise upstream status, such as queued or timed_out. */
	status: string;
	/** Check start time in milliseconds since the Unix epoch, when the forge supplies it. */
	startedAt?: number;
	url?: string;
};

/** A pull request (or merge request, or whatever the forge calls it) for a workspace's branch. */
export type PullRequest = {
	body?: string;
	number: string;
	title: string;
	url: string | null;
	state: 'open' | 'closed' | 'merged' | 'unknown';
	draft: boolean;
	autoMerge?: { enabled: boolean; canEnable: boolean; canDisable: boolean };
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
		counts?: CheckCounts;
		/** Individual checks on the head commit, when requested and available. */
		items?: PullCheck[];
		url: string | null;
	} | null;
	/** Where its reviews stand, the most decisive first; `null` if nobody was asked. */
	review: 'changes_requested' | 'approved' | 'pending' | null;
	/** Whether it conflicts with its base, so cannot be merged as it is. Absent where the forge does not say. */
	conflicts?: boolean;
	/**
	 * What else keeps it from being merged now, where the forge says: `behind` its base, which
	 * the base branch's rules want it up to date with, or those `rules` otherwise (required
	 * checks or reviews still missing). Absent where nothing does, or the forge does not say.
	 */
	blocked?: 'behind' | 'rules';
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
	/** Local branch and time of the daemon read. Cached answers keep their original time. */
	localBranch?: string;
	checkedAt?: number;
	/** How soon to look again: soon while checks run, rarely once the pull request is merged or closed. */
	refreshAfterMs?: number;
	/** Whether the branch has been pushed. */
	pushed: boolean;
	/** The page for opening a pull request for the branch, if the forge has one. */
	createUrl: string | null;
	pull: PullRequest | null;
};

/** Wake often enough to see ten-second deadlines without delaying a whole extra cycle. */
export const UPSTREAM_TICK_MS = 2_000;
export const CI_REFRESH_MS = 10_000;

/** A repository says how Geordi should treat it in this file, at its top level. */
export const CONFIG_FILE = '.geordi.yml';
/**
 * The names such a file may go by, the first that is there being the one that counts. YAML
 * is what we say and write; TOML is what it was first, and is still read.
 */
export const CONFIG_FILES = [CONFIG_FILE, '.geordi.toml'] as const;

/** How many ports a workspace gets where its repository names no jobs to count, nor a number. */
export const DEFAULT_PORTS = 10;

/**
 * Something a repository can have run for a workspace (FDR-006): a dev server, a database,
 * a desktop app, a game. Each runs in a terminal of its own.
 */
export type Job = {
	name: string;
	/** Optional display name; the key remains the job identity. */
	label?: string;
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

/**
 * A command a repository has run in a workspace at a moment of the workspace's life
 * (FDR-006): `setup` when its worktree is made, `teardown` before it is removed.
 */
export type Script = {
	command: string;
	/** Whether a person has agreed to run this command in this repository. */
	approved: boolean;
};

/**
 * The names of the setup and teardown scripts. No job can be called that: the setup runs in
 * a terminal named as a job's would be (`JOB_TERMINAL` + `setup`).
 */
export const SCRIPTS = ['setup', 'teardown'] as const;

/** A place to look at what the jobs serve: a link, with the jobs that have to be up for it to lead anywhere. */
export type Link = {
	name: string;
	/** Optional display name; the key remains the link identity. */
	label?: string;
	/** With the workspace's ports filled in. Always on this machine. */
	href: string;
	needs: string[];
};

/**
 * What a repository's `.geordi.yml` says, as it applies to one workspace: that of the
 * workspace if it has one, otherwise that of the branch work starts from.
 */
export type RepoConfig = {
	default?: `jobs.${string}` | `urls.${string}`;
	jobs: Job[];
	urls: Link[];
	/** Run once in a workspace's new worktree, before its agent starts. */
	setup: Script | null;
	/** Run when the workspace is archived, before its worktree is removed. */
	teardown: Script | null;
	/** The first of the workspace's ports, and how many it has. */
	ports: { first: number; count: number } | null;
	/** What is wrong with the file, if it can't be made sense of. */
	problem: string | null;
	/** Which file this is from: the workspace's own, or the one on the branch work starts from. */
	source: 'workspace' | 'base' | null;
	/** What that file is called (see `CONFIG_FILES`); `null` if there is none. */
	file: string | null;
};

/**
 * What a `.geordi.yml` can say, for agents to read (`configuration_reference`). The daemon's
 * parser (`config.ts`) accepts exactly these; a test holds the two together.
 */
export const CONFIG_SETTINGS = {
	default: {
		does: 'The job or URL for the Run button. Use its key, such as `jobs.web` or `urls.app`. Without a default, Run selects the first URL, or the first job if there are no URLs.',
		example: 'default: urls.app'
	},
	run: {
		does: 'The command that runs the project for someone to look at or use: its development server, a desktop app, a game. Short for a single job called `run`. Use this unless the project needs several things running.',
		example: 'run: pnpm dev --port $PORT'
	},
	jobs: {
		does: "Several things to run, each a `command` under a name (lower case letters, digits and dashes). `needs` lists the jobs that have to be up first: starting a job starts those, and stopping one stops the jobs that need it. An optional `label` supplies a human-readable display name (1–100 characters); the key still identifies dependencies and ports. Each job runs in a terminal of its own, in the workspace's directory, and should keep running until stopped.",
		example:
			'jobs:\n  db:\n    command: docker compose up db\n  web:\n    label: Development server\n    command: pnpm dev --port $PORT\n    needs: [db]'
	},
	urls: {
		does: "Places to open in the browser, each a `url` under a name. `{job}` stands for that job's port. Opening one first starts the jobs it mentions (and any listed under `needs`) and waits for them. An optional `label` supplies a human-readable display name (1–100 characters); otherwise the key is shown. Only addresses on this machine (`localhost`).",
		example: 'urls:\n  app:\n    label: Open app\n    url: http://localhost:{web}/'
	},
	setup: {
		does: "A command that gets a new workspace ready to work in: installing dependencies, copying an `.env`, setting up a database. It runs once, in the workspace's directory, when its worktree is made from the main line (not in one an agent starts from its own branch: there the agent sets up itself), in a terminal the person can watch; the agent's first turn waits for it. If it fails, the agent is told, with the end of its output. It gets the workspace's ports (`GEORDI_PORT…`) like everything else. A person has to agree to it once per repository (and again whenever it changes); until then it does not run, and the agent is told so.",
		example: 'setup: pnpm install && cp ../.env .env'
	},
	teardown: {
		does: 'A command that cleans up after a workspace when a person archives it, before its directory is removed: stopping services, dropping databases. It gets the same ports as everything in the workspace did. It has two minutes; archiving goes on however it ends. A person agrees to it together with the first commands they agree to run in the repository.',
		example: 'teardown: docker compose down --volumes'
	},
	ports: {
		does: `How many ports each workspace gets: one per job unless said otherwise (and ${DEFAULT_PORTS} where there are no jobs). Only needed for spare ones, beyond the jobs'. Every job has one port of its own, and it stays the same for as long as the workspace lives: the command gets it as \`PORT\`, and every job's port is in \`GEORDI_PORT_<NAME>\` (upper case, dashes as underscores) for all jobs, terminals and agents of the workspace. \`GEORDI_PORT\` is the first of the workspace's ports and \`GEORDI_PORTS\` how many there are. \`GEORDI_ASSIGNED_PORTS\` is a JSON array of every assigned port, in allocation order; use it for spare ports because allocations need not be contiguous. Never hard-code a port: two workspaces would collide.`,
		example: 'ports: 20'
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

/** How long a teardown script may take, before its worktree is removed regardless. */
export const TEARDOWN_TIMEOUT_MS = 120_000;
/** How long removing a worktree may take, with its teardown script. */
export const REMOVE_TIMEOUT_MS = TEARDOWN_TIMEOUT_MS + 30_000;

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

/** A package whose release level rises when the PR merges. */
export type ReleaseIncrease = {
	path: string;
	name: string;
	before: string;
	from: string;
	after: string;
	to: string;
};

/** Returned instead of merging when the person needs to make a choice. */
export type ReleaseReview = {
	token: string;
	increases: ReleaseIncrease[];
	problem: string | null;
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
/** A small picture, as it is served: its media type, and its bytes in base64. */
export type RepoIcon = { type: string; data: string };

export type DaemonRequest =
	/** What changed since the workspace branched off, and whether it is committed and pushed. */
	| ({ kind: 'changes' } & WorktreeRef)
	/**
	 * Removes the worktree (the branch stays). Refuses if it has uncommitted or untracked
	 * files, unless `force` says to discard them. With `teardown`, runs the repository's
	 * teardown script first, if a person agreed to it: give this `REMOVE_TIMEOUT_MS`. Only
	 * for a person archiving: unasked, it would run what an agent wrote in the worktree.
	 */
	| ({ kind: 'removeWorktree'; force: boolean; teardown: boolean } & WorktreeRef)
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
	/** Current text of a worktree-relative file, including files with no changes. */
	| ({ kind: 'source'; path: string } & WorktreeRef)
	/** Both versions of one of those files. */
	| ({ kind: 'diff'; path: string } & WorktreeRef)
	/**
	 * A picture on the daemon's machine that the workspace's agent referred to, to be shown
	 * where it did. `path` is as the agent wrote it: from the worktree, or absolute. `null`
	 * if there is no such file, or it is not a picture.
	 */
	| ({ kind: 'picture'; path: string } & WorktreeRef)
	/** The workspace's branch on the repository's upstream forge. */
	| ({
			kind: 'upstream';
			includeChecks?: boolean;
			/** Ask the forge now, rather than answer from what was learnt a moment ago. */
			fresh?: boolean;
	  } & WorktreeRef)
	/**
	 * Merges the pull request for the workspace's branch on the upstream forge. Refused
	 * unless it is open and at the very commit the workspace has checked out.
	 */
	| ({ kind: 'mergePull'; pullNumber: string; confirmation?: string } & WorktreeRef)
	| ({
			kind: 'setAutoMerge';
			pullNumber: string;
			enabled: boolean;
			confirmation?: string;
	  } & WorktreeRef)
	| ({ kind: 'markReady'; pullNumber: string } & WorktreeRef)
	/**
	 * Brings the latest of the branch the workspace's work is based on into its branch, where
	 * git can do that by itself: nothing uncommitted, no agent at work, no conflicts.
	 */
	| ({ kind: 'updateWorktree' } & WorktreeRef)
	/** The picture a repository has of itself (a favicon, a logo); `null` if it has none. */
	| { kind: 'repoIcon'; repoPath: string }
	/** A running terminal's recent output, to catch a new viewer up. */
	| { kind: 'terminalActivity'; workspaceId: string }
	| { kind: 'scrollback'; terminalId: string };

export type DaemonResults = {
	changes: Changes;
	/** The branch the worktree was on, as with `changes`; `null` if it was not there or on none. */
	removeWorktree: { branch: string | null };
	prepareWorktree: { path: string; branch: string };
	continueWorktree: { branch: string };
	approveRun: null;
	portReady: boolean;
	config: RepoConfig;
	release: ReleasePlan | null;
	repoIcon: RepoIcon | null;
	diff: FileVersions;
	source: string | null;
	picture: Picture | null;
	/** `null` if the repository has no remote on a forge we know. */
	upstream: Upstream | null;
	/** `queued` if the forge merges it later, on its own (a merge queue, say). */
	mergePull: 'merged' | 'queued' | ReleaseReview;
	markReady: null;
	setAutoMerge: null | ReleaseReview;
	/** `false` if it was left alone: bringing it up to date takes an agent's judgement. */
	updateWorktree: boolean;
	/**
	 * `end` is the terminal's output position after `data`: output with a lower `offset` is
	 * already part of it. `null` if the terminal isn't running.
	 */
	terminalActivity: boolean;
	scrollback: { data: string; end: number } | null;
};

export type TerminalSize = { cols: number; rows: number };

/** One thing an agent wants to know of the person: answered with one of `options`, or in their own words. */
export type Question = {
	question: string;
	/** A word or two saying what it is about. */
	header?: string;
	optional?: boolean;
	options: { label: string; description?: string }[];
	/** Whether several of the options may be chosen. */
	multiSelect: boolean;
};

export type PlanEntry = { content: string; status: string };
export type AgentPlan =
	{ type: 'items'; entries: PlanEntry[] } | { type: 'markdown'; content: string };

/**
 * What happens in a workspace's conversation with its agent, normalised across agent CLIs.
 * The daemon emits these; the forge stores them verbatim in its event log.
 */
export type SubagentState = 'running' | 'waiting' | 'done' | 'stopped' | 'failed' | 'unknown';

export type SubagentUpdate =
	| { kind: 'info'; title?: string | null; description?: string | null; state?: SubagentState }
	| { kind: 'message'; id: string; text: string; incoming: boolean }
	| ({
			kind: 'tool';
			id: string;
			name?: string;
			input?: string;
			output?: string;
			isError?: boolean;
			diff?: ToolDiff;
	  } & ToolInfo);

/** What ACP kinds of tool call there are: how a client may show one. */
export const TOOL_KINDS = [
	'read',
	'edit',
	'delete',
	'move',
	'search',
	'execute',
	'think',
	'fetch',
	'switch_mode',
	'other'
] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

/** A file a tool call works on, as the agent names it (absolute, mostly). */
export type ToolLocation = { path: string; line?: number };

/**
 * What an agent says about a tool call, for people: its kind, a readable title, the files
 * it touches. Absent in events from before Geordi knew them, and where an agent says none.
 */
export type ToolInfo = { toolKind?: ToolKind; title?: string; locations?: ToolLocation[] };

/**
 * What a tool call changed in files, as the agent reports it (ACP `diff` content), kept
 * with its result once it succeeded. Untrusted text: whoever shows it must parse it safely.
 */
export type ToolDiff = {
	/** Each file changed, by absolute path; `operation` is ACP's (`add`, `delete`, `modify`, `move`, `copy`, or newer). */
	files: { operation: string; path: string; oldPath?: string; fileType?: string }[];
	/** The changes as a git patch, with absolute paths; absent if the agent sent none, or `tooLarge`. */
	patch?: string;
	/** The patch was left out: it was larger than the event log keeps. */
	tooLarge?: boolean;
};

/**
 * How full the agent's context is, as its root session last said (ACP `usage_update`):
 * `used` of `size` tokens, and what the session has cost so far, where the agent says.
 */
export type ContextUsage = {
	used: number;
	size: number;
	cost?: { amount: number; currency: string };
};

/**
 * One of the usage limits of the subscription an agent runs on (a five-hour window, a
 * week), as its provider last said. Live data: account-wide, never stored.
 */
export type UsageLimit = {
	/** Which window it is, for people: `5h`, `Week`, `Week (Opus)`. */
	name: string;
	/** How much of it is used, 0 to 100, where the provider says. */
	usedPercent?: number;
	/** When it starts over (milliseconds since the epoch), where the provider says. */
	resetsAt?: number;
	/** `limited` once used up, `warning` when close to it. */
	status: 'ok' | 'warning' | 'limited';
};

export type BackgroundTask = {
	/** Identifies this live task for as long as its host can stop it. */
	stopId?: string;
	stopping?: boolean;
	stopError?: string;
	type: 'terminal' | 'tool_call' | 'subagent';
	id: string;
	/** Absent for work owned by the root ACP session. */
	session?: string;
	label?: string;
	toolCallId?: string;
};

/**
 * One of the agent's own commands (a slash command or a skill), as its CLI offers them: the
 * person invokes one by beginning a message with `/name`. The agent's live data (ADR-003),
 * never stored.
 */
export type AgentCommand = {
	/** Without the leading `/`. */
	name: string;
	description?: string;
	/** What it takes after its name, if anything. */
	hint?: string;
};

/**
 * What an agent says of its session that is live data, not history (ADR-003): never an
 * event, said again by a reconnecting daemon. Each is there only once the agent has said it.
 */
export type AgentLive = {
	/** What it has running in the background. */
	background?: BackgroundTask[];
	/** How full its context is, said after every model step. */
	usage?: ContextUsage;
	/** Its own commands, all of them, whenever they change. */
	commands?: AgentCommand[];
	/** The usage limits of the subscription it runs on, all of them, as it last said. */
	limits?: UsageLimit[];
	/** What it suggests the person say next, now that its turn is over; `null` once withdrawn. */
	suggestion?: string | null;
};

export type AgentEvent =
	| { kind: 'subagent'; path: string[]; update: SubagentUpdate }
	| { kind: 'message.received'; id: string }
	/** The workspace's worktree is ready. */
	| { kind: 'worktree'; path: string; branch: string }
	/** The agent CLI's own session ID, needed to resume the conversation in the next turn. */
	| { kind: 'resume'; id: string }
	| { kind: 'text'; text: string }
	/** A complete snapshot, or null when the wrapper withdraws this plan. */
	| { kind: 'plan'; id: string; plan: AgentPlan | null }
	| ({ kind: 'tool'; id: string; name: string; input: string } & ToolInfo)
	/** What an agent said of a tool call after it began: only what changed. */
	| ({ kind: 'tool.update'; id: string; input?: string } & ToolInfo)
	| { kind: 'tool.result'; id: string; output: string; isError: boolean; diff?: ToolDiff }
	/** What the agent calls its session (ACP `session_info_update`), at any time. */
	| { kind: 'title'; title: string }
	/** A form stays open until answered, withdrawn, or its turn ends. Older forms block. */
	| { kind: 'question'; id: string; questions: Question[]; blocking?: boolean }
	/** The host accepted the answer for this outstanding ACP request. */
	| { kind: 'answer.received'; id: string }
	| { kind: 'question.closed'; id: string }
	/**
	 * The agent has begun to work: on what it was told, or of its own accord (something it
	 * ran in the background has finished). Said once per turn, before anything else of it.
	 */
	| { kind: 'turn.started' }
	/** Every turn ends with exactly one of these two, with what it used where the agent says. */
	| { kind: 'turn.completed'; usage?: TurnUsage }
	| { kind: 'turn.failed'; error: string; usage?: TurnUsage };

/** The tokens one turn used, as ACP's (unstable) `Usage` reports them. */
export type TurnUsage = {
	totalTokens: number;
	inputTokens: number;
	outputTokens: number;
	thoughtTokens?: number;
	cachedReadTokens?: number;
	cachedWriteTokens?: number;
};

/** Forge → daemon. */
export type ForgeMessage =
	| { type: 'workspace.ack'; workspaceId: string; cursor: string }
	/** First message on every connection. */
	| { type: 'challenge'; nonce: string }
	/** Reply to a valid `hello`; the daemon trusts the forge only after verifying it. */
	| { type: 'welcome'; proof: string }
	/**
	 * Says something to the workspace's agent (ADR-010). If its CLI is not running, it is
	 * started with what is given here; if it is, the message reaches it as it runs: between
	 * turns it starts one, during a turn it steers.
	 */
	| ({
			type: 'agent.message';
			workspaceId: string;
			agent: Agent;
			settings: AgentSettings;
			/** Lets the agent call Geordi's agent API (ADR-004) as this workspace. */
			apiToken: string;
			/** The CLI's own ID of the conversation so far; `null` if this is its beginning. */
			resumeId: string | null;
			/** What the agent is told on top of its CLI's own system prompt: that it works in Geordi, and how. */
			instructions?: string;
			prompt: string;
			deliveryId?: string;
			images?: MessageImage[];
	  } & WorktreeRef)
	/** Stops what the agent is doing. Its CLI goes on running, to be told what to do instead. */
	| { type: 'agent.stopTask'; workspaceId: string; stopId: string }
	| { type: 'agent.stop'; workspaceId: string }
	/** Answers a `question` the agent asked: one answer per question, in their order. */
	| { type: 'agent.answer'; workspaceId: string; questionId: string; answers: string[] }
	| { type: 'request'; id: string; request: DaemonRequest }
	/**
	 * The worktrees someone is looking at right now (`open`), or all others in use
	 * (`background`), all of them: the daemon watches their files and reports changes, and
	 * stops watching any that are listed in neither.
	 */
	| { type: 'watch'; worktrees: WorktreeRef[]; scope?: WatchScope }
	/**
	 * Starts a shell in the workspace's directory. A workspace can have several terminals.
	 * With `run`, it runs one of the repository's jobs instead (or, as job `setup`, its setup
	 * script): `command` is that job's
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
	/**
	 * What changed in what the workspace's agent says of its session (`AgentLive`). Live,
	 * unacknowledged: said as it changes, and all of it again on reconnecting.
	 */
	| { type: 'workspace.live'; workspaceId: string; live: AgentLive }
	| {
			type: 'hello';
			protocol: number;
			/** Stable identity of the daemon's exclusively held session directory. */
			daemonId: string;
			/** The daemon's challenge for the forge. */
			nonce: string;
			/** Answer to the forge's challenge. */
			proof: string;
			/**
			 * The workspaces whose agent is at work, as far as the forge has been told (or is
			 * about to be, having been sent a message). An agent that began a turn of its own
			 * accord while the forge was away is not among them: it says so itself, next.
			 */
			running: string[];
			sessions?: string[];
			/** Terminals currently running on this daemon. */
			terminals: string[];
			/** Those of them whose command has ended (see `terminal.ended`), with its status. */
			ended?: Record<string, number>;
			/** The models and effort levels this daemon's agent CLIs offer. */
			harnesses: Harness[];
	  }
	| { type: 'workspace.event'; workspaceId: string; event: AgentEvent; cursor?: string }
	/** Answers a `request`, with either a result (see `DaemonResults`) or an error. */
	| { type: 'response'; id: string; result?: unknown; error?: string }
	/** `offset` counts the characters this terminal's shell had put out before `data`. */
	| { type: 'terminal.output'; terminalId: string; data: string; offset: number }
	| { type: 'terminal.exit'; terminalId: string }
	/**
	 * The command a terminal was opened to run (a job, a script) has ended, with this status.
	 * The terminal is still there, for its output to be read, until someone closes it.
	 */
	| { type: 'terminal.ended'; terminalId: string; status: number }
	/**
	 * The daemon started a terminal of its own accord: a new worktree's setup script. Those
	 * the forge asks for, it knows of.
	 */
	| { type: 'terminal.opened'; terminalId: string; run?: { job: string; command: string } }
	/** Something changed in a watched worktree's files or Git state. */
	| { type: 'worktree.changed'; worktreeId: string };
