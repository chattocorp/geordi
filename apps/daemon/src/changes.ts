import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileChange } from '@geordi/protocol';
import { branchRef, gitIn, headOf, type Worktree } from './worktree.ts';

/** Diffs are for reading; beyond this they are cut off. */
const MAX_DIFF = 400_000;
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

/** The text of an untracked file, or `null` if it is not a readable, regular text file. */
function readText(worktree: Worktree, path: string): string | null {
	const file = join(worktree.path, path);
	// lstat: a symlink could point anywhere on this machine
	if (!lstatSync(file).isFile() || lstatSync(file).size > MAX_DIFF) return null;
	const text = readFileSync(file, 'utf8');
	return text.includes('\0') ? null : text;
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

export function diff(worktree: Worktree, origin: Origin, path: string): string {
	const tracked = gitIn(worktree, 'diff', ...SAFE, forkPoint(worktree, origin), '--', path);
	if (tracked) return tracked.slice(0, MAX_DIFF);

	// Only files git itself lists as untracked, so `path` can't escape the worktree.
	if (!untracked(worktree).includes(path)) return '';
	const text = readText(worktree, path);
	if (text === null) return `Binary or special file ${path}\n`;
	const body = lines(text).map((line) => `+${line}`);
	return [`new file ${path}`, `@@ -0,0 +1,${body.length} @@`, ...body].join('\n') + '\n';
}
