import { query } from '$app/server';
import { store } from '#lib/server/events/index.ts';
import { repos, workspaces } from '#lib/server/app.ts';

/** Everything the sidebar and overview show: repositories, and all workspaces (newest first). */
export const getNavigation = query.live(async function* () {
	yield* store().live(() => {
		const all = workspaces().all();
		return {
			repos: repos()
				.list()
				.map((repo) => {
					const own = all.filter((workspace) => workspace.repoId === repo.id);
					return {
						...repo,
						workspaceCount: own.length,
						working: own.filter((workspace) => workspace.status === 'running').length
					};
				}),
			workspaces: all.map(({ id, title, repoId, parentId, status, worktree }) => ({
				id,
				title,
				repoId,
				parentId,
				status,
				branch: worktree?.branch ?? null
			}))
		};
	});
});
