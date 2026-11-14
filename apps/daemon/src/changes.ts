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
import { join } from 'node:path';
import type { FileChange, FileVersions } from '@geordi/protocol';
import { branchRef, gitIn, headOf, type Worktree } from './worktree.ts';

/** Files are for reading; beyond this size (in characters) they are not shown. */
const MAX_FILE = 1_000_000;
/**
 * Never run code the worktree can supply: no diff drivers, and no looking inside submodules
 * (git would run itself in them, under whatever config the agent put there).
 */
const SAFE = ['--no-ext-diff', '--no-textconv', '--no-renames', '--ignore-submodules=all'];

/** Where a workspace's changes are measured from: its repository, and the branch it started from. */
type Origin = { repoPath: string; base?: string };

/**
 * The commit the workspace's changes are measured against: where its branch forked off the
 * branch it started from (by default, whatever the repository has checked out). Committed
 * and uncommitted work both count as changes.
 */
function forkPoint(worktree: Worktree, { repoPath, base }: Origin): string {
	const from = base
		? branchRef(base)
		: execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	return gitIn(worktree, 'merge-base', headOf(worktree), from).trim();
}

const untracked = (worktree: Worktree) =>
	gitIn(worktree, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);

/**
 * The text of a file in the worktree, or `null` if it is not a readable, regular text file
 * that really is inside the worktree. An agent can swap any part of the path for a symlink
 * at any moment, so the path must resolve to itself, the file is opened without following a
 * link, and everything after that happens on the opened file, not on the path.
 */
function readText(worktree: Worktree, path: string): string | null {
	let fd: number;
	try {
		const file = join(realpathSync(worktree.path), path);
		if (realpathSync(file) !== file) return null;
		fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
	} catch {
		return null;
	}
	try {
		const stat = fstatSync(fd);
		if (!stat.isFile() || stat.size > MAX_FILE) return null;
		const text = readFileSync(fd, 'utf8');
		return text.includes('\0') ? null : text;
	} finally {
		closeSync(fd);
	}
}

const lines = (text: string) => (text ? text.replace(/\n$/, '').split('\n') : []);

export function changes(worktree: Worktree, origin: Origin): FileChange[] {
	const tracked = gitIn(worktree, 'diff', '--numstat', '-z', ...SAFE, forkPoint(worktree, origin))
		.split('\0')
		.filter(Boolean)
		.map((entry): FileChange => {
			const [added, removed, ...path] = entry.split('\t');
			const count = (value: string) => (value === '-' ? null : Number(value));
			return { path: path.join('\t'), added: count(added), removed: count(removed) };
		});

	const added = untracked(worktree).map((path): FileChange => {
		const text = readText(worktree, path);
		return {
			path,
			added: text === null ? null : lines(text).length,
			removed: text === null ? null : 0
		};
	});

	return [...tracked, ...added].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Both versions of a changed file, for a diff viewer. Only files that `changes` lists: that
 * keeps `path` inside the worktree, and away from whatever a symlink in it points to.
 */
export function versions(worktree: Worktree, origin: Origin, path: string): FileVersions {
	if (!changes(worktree, origin).some((file) => file.path === path))
		return { unavailable: 'This file has no changes any more.' };

	let old: string | null;
	try {
		old = gitIn(worktree, 'cat-file', 'blob', `${forkPoint(worktree, origin)}:${path}`);
	} catch {
		old = null; // not there at the fork point: the file is new
	}

	const exists = lstatSync(join(worktree.path, path), { throwIfNoEntry: false });
	const now = exists ? readText(worktree, path) : null;
	if ((exists && now === null) || old?.includes('\0') || (old?.length ?? 0) > MAX_FILE)
		return { unavailable: 'This file is binary, too large or not a regular file.' };

	return { old, new: now };
}
