import { error } from '@sveltejs/kit';
import type { WorktreeRef } from '@geordi/protocol';
import type { createWorkspaces } from './workspaces.ts';

type Parts = {
	workspaces: ReturnType<typeof createWorkspaces>;
	/** Ends every shell of a workspace. */
	closeTerminals(workspaceId: string): void;
	/** Has a daemon remove a worktree; rejects if it has work that `discard` doesn't allow losing. */
	removeWorktree(ref: WorktreeRef, discard: boolean): Promise<unknown>;
};

/**
 * Archives a workspace together with every workspace its agent started (and theirs): they
 * are part of the same piece of work, and nobody would find them again without it. Each one
 * has its shells ended, its worktree removed (unless a workspace that stays still works in
 * it) and is taken out of the lists. Branches and conversations stay.
 *
 * Nothing is archived while any of them is still working. A worktree with uncommitted or
 * untracked files stops the archiving there, unless `discard` is set; what was archived
 * before stays archived, and trying again carries on.
 */
export function createArchiver({ workspaces, closeTerminals, removeWorktree }: Parts) {
	return async function archive(id: string, discard: boolean, actor: string | null = null) {
		// children before their parents, so a shared worktree goes with its last user
		const family = [id, ...workspaces.descendants(id)].reverse().map(workspaces.summary);

		const busy = family.find((workspace) => workspace.status === 'running');
		if (busy) error(409, `Stop the agent in “${busy.title}” before archiving`);

		for (const workspace of family) {
			if (workspace.archivedAt) continue;
			closeTerminals(workspace.id);
			if (workspace.worktree && !workspaces.worktreeInUse(workspace.id)) {
				try {
					await removeWorktree(workspaces.ref(workspace.id), discard);
				} catch (problem) {
					const reason = problem instanceof Error ? problem.message : String(problem);
					error(409, workspace.id === id ? reason : `“${workspace.title}”: ${reason}`);
				}
			}
			workspaces.archive(workspace.id, actor);
		}
	};
}
