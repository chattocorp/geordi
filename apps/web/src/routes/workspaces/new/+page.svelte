<script lang="ts">
	import { resolve } from '$app/paths';
	import NewWorkspace from '#lib/components/workspace/NewWorkspace.svelte';
	import Page from '#lib/ui/Page.svelte';
	import { getNavigation } from '../../nav.remote';

	const nav = $derived(await getNavigation());
	// most likely the repository worked in last
	const preferred = $derived(nav.workspaces[0]?.repoId);
</script>

<Page title="New workspace">
	{#snippet description()}Tell an agent what to do. It gets its own branch to do it on.{/snippet}

	{#if nav.repos.length > 0}
		<NewWorkspace repos={nav.repos} {preferred} />
	{:else}
		<p class="empty">
			Register a repository on the <a href={resolve('/')} class="underline">overview</a> first.
		</p>
	{/if}
</Page>
