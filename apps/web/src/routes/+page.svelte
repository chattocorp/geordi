<script lang="ts">
	import { page } from '$app/state';
	import { openSettings } from '#lib/components/settings.svelte.ts';
	import NewWorkspace from '#lib/components/workspace/NewWorkspace.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Page from '#lib/ui/Page.svelte';
	import { getNavigation } from './nav.remote';

	const nav = $derived(await getNavigation());
	// the one that was asked for (from its place in the sidebar), else most likely the one worked in last
	const preferred = $derived(page.url.searchParams.get('repo') ?? nav.workspaces[0]?.repoId);
</script>

<Page title="New workspace">
	{#snippet description()}Tell an agent what to do. It gets its own branch to do it on.{/snippet}

	{#if nav.repos.length > 0}
		<NewWorkspace repos={nav.repos} {preferred} focused />
	{:else}
		<div class="empty">
			<p class="pb-4">Agents work in a repository. Add one first.</p>
			<Button variant="primary" onclick={() => openSettings('repositories')}>
				Add a repository
			</Button>
		</div>
	{/if}
</Page>
