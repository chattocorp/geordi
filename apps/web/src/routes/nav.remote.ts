import { query } from '$app/server';
import { store } from '#lib/server/events/index.ts';
import { repos, workspaces } from '#lib/server/app.ts';

/** Everything the sidebar and overview show: repositories with their recent workspaces. */
export const getNavigation = query.live(async function* () {
	yield* store().live(() =>
		repos()
			.list()
			.map((repo) => {
				const all = workspaces().list(repo.id);
				return {
					...repo,
					workspaceCount: all.length,
					working: all.filter((workspace) => workspace.status === 'running').length,
					recent: all.slice(0, 12)
				};
			})
	);
});
