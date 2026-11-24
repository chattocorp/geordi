<script lang="ts">
	import { page } from '$app/state';
	import { follow } from '#lib/live.svelte.ts';
	import UpcomingRelease from '#lib/components/UpcomingRelease.svelte';
	import type { RepositoryReleaseView } from '#lib/server/views.ts';
	import { refreshRepoRelease } from '../../../repos.remote';
	const view = follow<RepositoryReleaseView>('repositoryRelease', () => page.params.id);
</script>

<UpcomingRelease
	state={view.current}
	problem={view.error?.message}
	onrefresh={(allow) => refreshRepoRelease({ id: page.params.id!, allow })}
/>
