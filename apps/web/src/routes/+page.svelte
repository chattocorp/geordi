<script lang="ts">
	import { page } from '$app/state';
	import { openSettings } from '#lib/components/settings.svelte.ts';
	import NewWorkspace from '#lib/components/workspace/NewWorkspace.svelte';
	import { PROJECT } from '#lib/components/workspace/RepoPicker.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import Page from '#lib/ui/Page.svelte';
	import WaitingForView from '#lib/components/WaitingForView.svelte';
	import { connection, follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';

	const live = follow<Navigation>('navigation');
	const nav = $derived(live.current);
	// the one that was asked for (from its place in the sidebar: a repository, or a new
	// project), else most likely the one worked in last
	const preferred = $derived(
		(page.url.searchParams.has('project') ? PROJECT : page.url.searchParams.get('repo')) ??
			nav?.workspaces.find((workspace) => workspace.repoId !== null)?.repoId ??
			undefined
	);
</script>

<Page title="New workspace" wide>
	{#snippet description()}
		Tell an agent what to do. In a repository, it gets its own branch to do it on; in a new project,
		it orchestrates agents across your repositories.
	{/snippet}

	{#if !nav}
		<WaitingForView lost={connection.state === 'lost'} />
	{:else if nav.repos.length > 0}
		<div class="flex flex-1 flex-col justify-center">
			<NewWorkspace repos={nav.repos} {preferred} focused />
		</div>
	{:else}
		<div class="empty">
			<p class="pb-4">Agents work in a repository. Add one first.</p>
			<Button variant="primary" onclick={() => openSettings('repositories')}>
				Add a repository
			</Button>
		</div>
	{/if}
</Page>
