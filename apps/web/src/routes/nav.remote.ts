import { query } from '$app/server';
import { store } from '#lib/server/events/index.ts';
import { repos, sessions } from '#lib/server/app.ts';

/** Everything the sidebar and overview show: repositories with their recent sessions. */
export const getNavigation = query.live(async function* () {
	yield* store().live(() =>
		repos()
			.list()
			.map((repo) => {
				const all = sessions().list(repo.id);
				return {
					...repo,
					sessionCount: all.length,
					working: all.filter((session) => session.status === 'running').length,
					recent: all.slice(0, 12)
				};
			})
	);
});
