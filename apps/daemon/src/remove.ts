import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { uncommittedFiles } from './changes.ts';
import { describe, verifyLinks, type Worktree } from './worktree.ts';

/**
 * Gets a directory out of the way at once, and deletes it in its own time. A worktree with
 * its dependencies installed is tens of thousands of files: deleting them takes seconds,
 * which whoever archives a workspace shouldn't wait for, and during which a daemon that
 * did it in one go would do nothing else (follow no agent, relay no terminal).
 */
function discard(baseDir: string, path: string) {
	const trash = join(baseDir, '.trash');
	mkdirSync(trash, { recursive: true });
	const doomed = join(trash, `${basename(path)}-${Date.now()}`);
	renameSync(path, doomed); // the same disk: a matter of a moment
	rm(doomed, { recursive: true, force: true }).catch(() => {});
}

/** Deletes what an earlier daemon had put out of the way and didn't get to delete. */
export const emptyTrash = (baseDir: string) =>
	rm(join(baseDir, '.trash'), { recursive: true, force: true }).catch(() => {});

/**
 * The workspace's worktree, if it is there and may be removed: it has no uncommitted or
 * untracked files, or `force` says to discard them. Throws if it may not.
 */
export function removable(
	baseDir: string,
	repoPath: string,
	worktreeId: string,
	force: boolean
): Worktree | null {
	const worktree = describe(baseDir, repoPath, worktreeId);
	if (!existsSync(worktree.path)) return null;
	if (!force) {
		// if its Git metadata was tampered with, we can't tell what is in it: that takes `force`
		verifyLinks(worktree);
		if (uncommittedFiles(worktree).length > 0)
			throw new Error('The worktree has uncommitted or untracked files.');
	}
	return worktree;
}

/**
 * Removes a workspace's worktree; its branch stays. Refuses while the worktree has
 * uncommitted or untracked files, unless `force` says to discard them (see `removable`). A
 * worktree that is already gone is fine.
 *
 * Not `git worktree remove`: that runs git inside the worktree, on the worktree's own
 * metadata, which an agent can write. We look for uncommitted work the careful way, delete
 * the directory ourselves, and have git forget it from the repository's side.
 */
export function removeWorktree(
	baseDir: string,
	repoPath: string,
	worktreeId: string,
	force: boolean
) {
	const worktree = removable(baseDir, repoPath, worktreeId, force);
	if (worktree) discard(baseDir, worktree.path);
	execFileSync('git', ['-C', repoPath, 'worktree', 'prune'], { stdio: 'ignore' });
}
