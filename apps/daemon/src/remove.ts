import type { DaemonRequest, PullRequest, WorktreeRef } from '@geordi/protocol';
import { randomUUID } from 'node:crypto';
import { git } from './git.ts';
import { existsSync, lstatSync, mkdirSync, renameSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { uncommittedFiles } from './changes.ts';
import {
	cleanMergedBranch,
	branchBeforeCleanup,
	describe,
	verifyLinks,
	worktreePath,
	type Worktree
} from './worktree.ts';

/** Inspect directory entries without following a worktree's agent-writable Git links. */
function entryExists(path: string) {
	try {
		lstatSync(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw error;
	}
}

/** Registered checkouts have a .git directory or a linked-worktree .git file. */
export const hasCheckout = (repoPath: string) => entryExists(join(repoPath, '.git'));

/** A worktree parent must still be a directory inside the daemon's worktrees. */
function checkParent(path: string) {
	const parent = lstatSync(dirname(path), { throwIfNoEntry: false });
	if (parent && !parent.isDirectory())
		throw new Error(`Invalid worktree directory: ${dirname(path)}`);
}

/**
 * Gets a directory out of the way at once, and deletes it in its own time. A worktree with
 * its dependencies installed is tens of thousands of files: deleting them takes seconds,
 * which whoever archives a workspace shouldn't wait for, and during which a daemon that
 * did it in one go would do nothing else (follow no agent, relay no terminal).
 */
function discard(baseDir: string, path: string) {
	checkParent(path);
	const trash = join(baseDir, '.trash');
	mkdirSync(trash, { recursive: true });
	const doomed = join(trash, `${basename(path)}-${randomUUID()}`);
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
async function removable(
	baseDir: string,
	ref: WorktreeRef,
	force: boolean
): Promise<Worktree | null> {
	const worktree = await describe(baseDir, ref);
	if (!existsSync(worktree.path)) return null;
	if (!force) {
		// if its Git metadata was tampered with, we can't tell what is in it: that takes `force`
		verifyLinks(worktree);
		if ((await uncommittedFiles(worktree)).length > 0)
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
export async function removeWorktree(
	baseDir: string,
	ref: WorktreeRef,
	force: boolean,
	signal?: AbortSignal
) {
	const worktree = await removable(baseDir, ref, force);
	signal?.throwIfAborted();
	if (!hasCheckout(ref.repoPath))
		throw new Error('The checkout disappeared. Review the archive again.');
	if (worktree) discard(baseDir, worktree.path);
	await git(ref.repoPath, ['worktree', 'prune']);
}

/** Archive one worktree, including leftover folders from a removed checkout. */
export async function archiveWorktree(
	baseDir: string,
	request: Extract<DaemonRequest, { kind: 'removeWorktree' }>,
	tearDown: (tree: Worktree, ref: WorktreeRef) => Promise<void>,
	stopSessions: (path: string) => Promise<void>,
	signal?: AbortSignal,
	pullFor?: (branch: string | null) => PullRequest | null | undefined
) {
	signal?.throwIfAborted();
	const path = worktreePath(baseDir, request);
	if (request.removingRepository) {
		checkParent(path);
		if (!hasCheckout(request.repoPath)) {
			await stopSessions(path);
			signal?.throwIfAborted();
			if (entryExists(path)) discard(baseDir, path);
			return null;
		}
	} else if (!hasCheckout(request.repoPath)) {
		throw new Error('The checkout is missing. Remove the repository in Settings → Repositories.');
	}
	const tree = await removable(baseDir, request, request.force);
	signal?.throwIfAborted();
	if (tree && request.teardown) await tearDown(tree, request);
	signal?.throwIfAborted();
	await stopSessions(path);
	signal?.throwIfAborted();
	let previous = null;
	try {
		if (tree) {
			verifyLinks(tree);
			previous = await branchBeforeCleanup(request.repoPath, tree);
		}
	} catch {
		// Forced removal can encounter an unreadable HEAD. Keep the forge's last known branch.
	}
	await removeWorktree(baseDir, request, request.force, signal);
	if (previous && !request.removingRepository)
		await cleanMergedBranch(request.repoPath, previous, {
			base: request.base,
			pull: pullFor?.(previous.branch),
			archiveId: request.worktreeId
		});
	return previous?.branch ?? null;
}
