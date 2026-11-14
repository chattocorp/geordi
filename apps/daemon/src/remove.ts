import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { uncommittedFiles } from './changes.ts';
import { describe, verifyLinks } from './worktree.ts';

/**
 * Removes a workspace's worktree; its branch stays. Refuses while the worktree has
 * uncommitted or untracked files, unless `force` says to discard them. A worktree that is
 * already gone is fine.
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
	const worktree = describe(baseDir, repoPath, worktreeId);

	if (existsSync(worktree.path)) {
		if (!force) {
			// if its Git metadata was tampered with, we can't tell what is in it: that takes `force`
			verifyLinks(worktree);
			if (uncommittedFiles(worktree).length > 0)
				throw new Error('The worktree has uncommitted or untracked files.');
		}
		rmSync(worktree.path, { recursive: true, force: true });
	}
	execFileSync('git', ['-C', repoPath, 'worktree', 'prune'], { stdio: 'ignore' });
}
