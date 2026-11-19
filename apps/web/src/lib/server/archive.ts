import { error } from '@sveltejs/kit';
import type { WorktreeRef } from '@geordi/protocol';
import type { createWorkspaces } from './workspaces.ts';

type Parts = {
	workspaces: ReturnType<typeof createWorkspaces>;
	/** Ends every shell of a workspace. */
	closeTerminals(workspaceId: string): void;
	/**
	 * Has a daemon remove a worktree; rejects if it has work that `discard` doesn't allow
	 * losing. `teardown` runs the repository's teardown script first.
	 */
	removeWorktree(ref: WorktreeRef, discard: boolean, teardown: boolean): Promise<unknown>;
	/** Has a daemon end the agents in a project's folder, which stays (FDR-012). */
	closeProject(projectId: string): Promise<unknown>;
};

/**
 * Archives a workspace together with every workspace its agent started (and theirs): they
 * are part of the same piece of work, and nobody would find them again without it. Each one
 * has its shells ended, its worktree removed (unless a workspace that stays still works in
 * it) and is taken out of the lists. Branches and conversations stay.
 *
 * Nothing is archived while any of them is still working, and none of them can be given
 * anything to do while it goes on: removing a worktree means waiting for a daemon, and an
 * agent must not start in a directory that is on its way out. A worktree with uncommitted
 * or untracked files stops the archiving there (422), unless `discard` is set; what was
 * archived before stays archived, and trying again carries on. Shells are only ended once
 * the worktree is gone: a refusal costs nobody their terminals.
 *
 * A project (FDR-012) goes with the agents working in its folder, which end; the folder
 * stays, for when it is restored. What it started in a repository carries on without it.
 */
export function createArchiver({
	workspaces,
	closeTerminals,
	removeWorktree,
	closeProject
}: Parts) {
	return async function archive(id: string, discard: boolean, actor: string | null = null) {
		// children before their parents, so a shared worktree goes with its last user
		const family = [id, ...workspaces.descendants(id)].reverse().map(workspaces.summary);

		const busy = family.find((workspace) => workspace.status === 'running');
		if (busy) error(409, `Stop the agent in “${busy.title}” before archiving`);

		const release = workspaces.hold(
			family.flatMap((workspace) => [workspace.id, workspace.worktreeId])
		);
		try {
			for (const workspace of family) {
				if (workspace.archivedAt) continue;
				// a project's agents end with it, once nothing else works in its folder; the folder stays
				if (
					workspace.repoId === null &&
					workspace.worktreeId === workspace.id &&
					!workspaces.worktreeInUse(workspace.id)
				)
					try {
						await closeProject(workspace.id);
					} catch (problem) {
						error(422, problem instanceof Error ? problem.message : String(problem));
					}
				if (workspace.worktree && !workspaces.worktreeInUse(workspace.id)) {
					try {
						// The teardown runs what is in the worktree, as the person: only when they archive.
						// An agent archiving the agents it started leaves it to the person (FDR-006).
						await removeWorktree(workspaces.ref(workspace.id), discard, actor === null);
					} catch (problem) {
						const reason = problem instanceof Error ? problem.message : String(problem);
						error(422, workspace.id === id ? reason : `“${workspace.title}”: ${reason}`);
					}
				}
				closeTerminals(workspace.id);
				workspaces.archive(workspace.id, actor);
			}
		} finally {
			release();
		}
	};
}
