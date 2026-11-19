<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getRepositoryThreads } from '../../repos.remote';
	import { follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import Page from '#lib/ui/Page.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import RepositoryThreads from '#lib/components/RepositoryThreads.svelte';
	let { data } = $props();
	const nav = follow<Navigation>('navigation');
	const issues = $derived(page.url.searchParams.get('tab') === 'issues');
	const base = $derived(resolve('/repos/[id]', { id: data.id }));
	const threads = $derived(
		getRepositoryThreads({
			id: data.id,
			category: issues ? 'issue' : 'pull_request',
			after: page.url.searchParams.get('after') ?? undefined
		})
	);
	const listing = $derived(threads.current);
	const issuesHref = $derived(base + '?tab=issues');
</script>

<Page title={data.name} wide>
	<nav
		aria-label="Repository"
		class="inline-flex items-center gap-1 self-start rounded-control bg-sunken p-1"
	>
		<a
			href={resolve('/repos/[id]', { id: data.id })}
			aria-current={!issues ? 'page' : undefined}
			class={['item px-3 py-1.5 font-medium', !issues && 'item-active']}>Pull requests</a
		>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved repository route plus the tab -->
		<a
			href={issuesHref}
			aria-current={issues ? 'page' : undefined}
			class={['item px-3 py-1.5 font-medium', issues && 'item-active']}>Issues</a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</nav>
	{#if !listing}<p class="px-3 text-sm text-muted" role="status">
			Loading {issues ? 'issues' : 'pull requests'}…
		</p>
	{:else if 'problem' in listing}<Notice
			>{listing.problem}
			<button class="underline" onclick={() => threads.refresh()}>Retry</button></Notice
		>
	{:else}
		<RepositoryThreads
			repo={data.id}
			{issues}
			items={listing.items}
			workspaces={nav.current?.workspaces ?? []}
			more={!!listing.next}
		/>
		{#if listing.next}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- href uses the resolved repository route -->
			<a
				class="item self-start px-3 py-2 text-sm"
				href={(issues ? issuesHref + '&' : base + '?') +
					new URLSearchParams({ after: listing.next })}>Next page →</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	{/if}
</Page>
