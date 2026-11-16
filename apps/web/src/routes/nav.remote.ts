import { query } from '$app/server';
import { outcome } from '#lib/attention.ts';
import { withAides } from '#lib/family.ts';
import { live } from '#lib/server/events/index.ts';
import { repos, workspaces } from '#lib/server/app.ts';

/**
 * Everything the sidebar shows: repositories, and the workspaces that stand for themselves
 * (newest first). An agent working in another workspace's directory is part of that one:
 * it makes it `working`, and what it started counts as started there. `outcome` is how all
 * of their work came to rest, `null` while any of it goes on (FDR-008).
 */
export const getNavigation = query.live(async function* () {
	yield* live(() => {
		const all = workspaces().all();
		const ownerOf = new Map(all.map((workspace) => [workspace.id, workspace.worktreeId]));
		const listed = withAides(all).map(({ workspace, aides }) => {
			const { id, title, repoId, parentId, status, worktree } = workspace;
			return {
				id,
				title,
				repoId,
				parentId: (parentId && ownerOf.get(parentId)) ?? parentId,
				status,
				working: status === 'running' || aides.some((aide) => aide.status === 'running'),
				outcome: outcome([workspace, ...aides]),
				branch: worktree?.branch ?? null
			};
		});
		return {
			repos: repos()
				.list()
				.map((repo) => {
					const own = listed.filter((workspace) => workspace.repoId === repo.id);
					return {
						...repo,
						workspaceCount: own.length,
						working: own.filter((workspace) => workspace.working).length
					};
				}),
			workspaces: listed
		};
	});
});
