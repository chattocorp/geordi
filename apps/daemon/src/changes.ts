import { execFileSync } from 'node:child_process';
import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	openSync,
	readFileSync,
	realpathSync
} from 'node:fs';
import { isAbsolute, join, sep } from 'node:path';
import type { Changes, FileChange, FileVersions } from '@geordi/protocol';
import {
	branchOf,
	branchRef,
	gitIn,
	headOf,
	startOf,
	upstreamBranchOf,
	type Worktree
} from './worktree.ts';

/** Files are for reading; beyond this size (in characters) they are not shown. */
const MAX_FILE = 1_000_000;
/**
 * Never run code the worktree can supply: no diff drivers, and no looking inside submodules
 * (git would run itself in them, under whatever config the agent put there).
 */
const SAFE = ['--no-ext-diff', '--no-textconv', '--ignore-submodules=all'];

/** Where a workspace's changes are measured from: its repository, and the branch it started from. */
export type Origin = { repoPath: string; base?: string };

/**
 * The commit the workspace's changes are measured against: where its branch forked off the
 * branch it started from (by default, the upstream's main branch; see `startOf`). Committed
 * and uncommitted work both count as changes.
 */
function forkPoint(worktree: Worktree, { repoPath, base }: Origin): string {
	const start = base ? branchRef(base) : startOf(repoPath);
	const from = execFileSync('git', ['-C', repoPath, 'rev-parse', start], {
		encoding: 'utf8'
	}).trim();
	return gitIn(worktree, 'merge-base', headOf(worktree), from).trim();
}

const untracked = (worktree: Worktree) =>
	gitIn(worktree, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);

/**
 * The text of a file in the worktree, or `null` if it is not a readable, regular text file
 * that really is inside the worktree.
 *
 * An agent can swap any part of the path for a symlink at any moment. So the path must
 * resolve to itself both before and after opening, the file is opened without following a
 * link, and what we opened must be what the path names afterwards. Size and type are
 * checked on the open file, not on the path. Opening never waits (a named pipe would block
 * the whole daemon otherwise).
 */
export function readText(worktree: Worktree, path: string): string | null {
	if (
		isAbsolute(path) ||
		path.split(sep).some((part) => part === '..' || part.toLowerCase() === '.git')
	)
		return null;
	let fd: number;
	let file: string;
	try {
		file = join(realpathSync(worktree.path), path);
		if (realpathSync(file) !== file) return null;
		fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	} catch {
		return null;
	}
	try {
		const opened = fstatSync(fd);
		const named = lstatSync(file);
		const same = opened.dev === named.dev && opened.ino === named.ino;
		if (!same || realpathSync(file) !== file) return null;
		if (!opened.isFile() || opened.size > MAX_FILE) return null;
		const text = readFileSync(fd, 'utf8');
		return text.includes('\0') ? null : text;
	} catch {
		return null;
	} finally {
		closeSync(fd);
	}
}

/** How many untracked files get their lines counted. */
const MAX_COUNTED = 200;

const lines = (text: string) => (text ? text.replace(/\n$/, '').split('\n') : []);

const STATUS: Record<string, FileChange['status']> = { A: 'added', D: 'deleted', R: 'renamed' };

export function changes(worktree: Worktree, origin: Origin): FileChange[] {
	// With renames found (`-M`), so that a moved file is one change and not two. Git does
	// that by comparing contents itself: nothing of the worktree's gets to run.
	const diff = (format: string) =>
		gitIn(worktree, 'diff', format, '-z', '-M', ...SAFE, forkPoint(worktree, origin)).split('\0');

	// `--name-status -z`: a status, then the path; a rename has the old path and the new.
	const states = new Map<string, Pick<FileChange, 'status' | 'from'>>();
	for (let fields = diff('--name-status'); fields.length > 1;) {
		const [status, path] = fields.splice(0, 2);
		if (status.startsWith('R')) states.set(fields.shift()!, { status: 'renamed', from: path });
		else states.set(path, { status: STATUS[status] ?? 'modified' });
	}

	// `--numstat -z`: counts and the path; a rename has no path there, but two after it.
	const tracked: FileChange[] = [];
	for (let fields = diff('--numstat'); fields.length > 1;) {
		const [added, removed, ...rest] = fields.shift()!.split('\t');
		const path = rest.join('\t') || fields.splice(0, 2)[1];
		const count = (value: string) => (value === '-' ? null : Number(value));
		tracked.push({
			path,
			...(states.get(path) ?? { status: 'modified' }),
			added: count(added),
			removed: count(removed)
		});
	}

	// Reading files to count their lines is only worth it for a workspace's own handful of new
	// files, not for a `node_modules` nobody ignored: beyond that, they are just listed.
	const added = untracked(worktree).map((path, index): FileChange => {
		const text = index < MAX_COUNTED ? readText(worktree, path) : null;
		return {
			path,
			status: 'added',
			added: text === null ? null : lines(text).length,
			removed: text === null ? null : 0
		};
	});

	return [...tracked, ...added].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The files with changes that are not committed: modified, staged, or new. Not `git
 * status`: `gitIn` runs against the repository's own .git, whose HEAD is not the worktree's.
 */
export function uncommittedFiles(worktree: Worktree): string[] {
	const modified = gitIn(
		worktree,
		'diff',
		'--name-only',
		'--no-renames',
		'-z',
		...SAFE,
		headOf(worktree)
	)
		.split('\0')
		.filter(Boolean);
	return [...modified, ...untracked(worktree)];
}

/**
 * Whether the branch has had commits of its own, all of which are in the branch it started
 * from by now. The branch's own history (its reflog, in the repository) says where it was
 * made: a branch still there has had no work to land.
 */
function landed(worktree: Worktree, { repoPath, base }: Origin, head: string): boolean {
	if (!head.startsWith('refs/heads/')) return false;
	try {
		const tip = gitIn(worktree, 'rev-parse', head).trim();
		const made = gitIn(worktree, 'reflog', 'show', '--format=%H', head).trim().split('\n').at(-1);
		if (!made || made === tip) return false;
		const start = execFileSync(
			'git',
			['-C', repoPath, 'rev-parse', base ? branchRef(base) : startOf(repoPath)],
			{ encoding: 'utf8' }
		).trim();
		gitIn(worktree, 'merge-base', '--is-ancestor', tip, start); // throws if it is not
		return true;
	} catch {
		return false;
	}
}

/**
 * The branch a workspace's work is based on, as a full ref (`refs/remotes/origin/main`, or
 * the branch of the workspace that started it); `null` where there is none to name.
 */
export function baseOf({ repoPath, base }: Origin): string | null {
	try {
		const ref = base ? branchRef(base) : startOf(repoPath);
		// Resolve HEAD in the source repository, never in the workspace.
		const branch = execFileSync('git', ['-C', repoPath, 'rev-parse', '--symbolic-full-name', ref], {
			encoding: 'utf8'
		}).trim();
		return branch.startsWith('refs/') ? branch : null;
	} catch {
		return null;
	}
}

/** Compare against the base as last fetched; a missing base is unknown, not up to date. */
function incoming(worktree: Worktree, origin: Origin): Changes['incoming'] {
	const branch = baseOf(origin);
	if (!branch) return null;
	try {
		const commits = Number(
			gitIn(worktree, 'rev-list', '--count', `${headOf(worktree)}..${branch}`).trim()
		);
		return { branch, commits };
	} catch {
		return null;
	}
}

/** The workspace's changes, and how far they have got: committed? pushed? */
export function status(worktree: Worktree, origin: Origin): Changes {
	const head = headOf(worktree);
	const uncommitted = uncommittedFiles(worktree).length;

	// What is on the remote, as far as this machine knows: the remote-tracking branch.
	let unpushed: number | null = null;
	if (head.startsWith('refs/heads/')) {
		// under whatever name the branch was pushed
		const branch = upstreamBranchOf(origin.repoPath, head.slice('refs/heads/'.length));
		const remote = `refs/remotes/origin/${branch}`;
		try {
			unpushed = Number(gitIn(worktree, 'rev-list', '--count', `${remote}..${head}`).trim());
		} catch {
			// no such remote branch: nothing of this branch is pushed
		}
	}

	return {
		branch: branchOf(worktree),
		files: changes(worktree, origin),
		uncommitted,
		unpushed,
		landed: landed(worktree, origin, head),
		incoming: incoming(worktree, origin)
	};
}

/**
 * Both versions of a changed file, for a diff viewer. Only files that `changes` lists: that
 * keeps `path` inside the worktree, and away from whatever a symlink in it points to.
 */
export function versions(worktree: Worktree, origin: Origin, path: string): FileVersions {
	const change = changes(worktree, origin).find((file) => file.path === path);
	if (!change) return { unavailable: 'This file has no changes any more.' };

	let old: string | null;
	try {
		// a renamed file's old version is under its old name
		const before = `${forkPoint(worktree, origin)}:${change.from ?? path}`;
		old = gitIn(worktree, 'cat-file', 'blob', before);
	} catch {
		old = null; // not there at the fork point: the file is new
	}

	const exists = lstatSync(join(worktree.path, path), { throwIfNoEntry: false });
	const now = exists ? readText(worktree, path) : null;
	if ((exists && now === null) || old?.includes('\0') || (old?.length ?? 0) > MAX_FILE)
		return { unavailable: 'This file is binary, too large or not a regular file.' };

	return { old, new: now };
}
