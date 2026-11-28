<script lang="ts">
	import { page } from '$app/state';
	import NewWorkspace from '#lib/components/workspace/NewWorkspace.svelte';
	import Page from '#lib/ui/Page.svelte';
	import WaitingForView from '#lib/components/WaitingForView.svelte';
	import { connection, follow } from '#lib/live.svelte.ts';
	import { persisted } from '@geordi/ui/persisted';
	import type { Navigation } from '#lib/server/views.ts';

	const live = follow<Navigation>('navigation');
	const nav = $derived(live.current);
	const issue = $derived.by(() => {
		const url = page.url.searchParams.get('issue');
		const title = page.url.searchParams.get('title');
		return url && title ? { url, title } : undefined;
	});
	// The repository to begin in: the one asked for (with its + in the sidebar), else the one
	// picked last. Never one guessed from where the person has been looking.
	const asked = $derived(page.url.searchParams.get('repo'));
	const remembered = persisted<string | null>('geordi:new-workspace-repo', null);
	$effect(() => {
		if (asked) remembered.current = asked;
	});
	const preferred = $derived(asked ?? remembered.current ?? undefined);
</script>

<Page title="New workspace" wide>
	{#snippet description()}
		Tell an agent what to do. It gets its own branch to do it on.
	{/snippet}

	{#if !nav}
		<WaitingForView lost={connection.state === 'lost'} />
	{:else}
		<div class="flex flex-1 flex-col justify-center">
			{#key page.url.search}<NewWorkspace
					repos={nav.repos}
					{preferred}
					{issue}
					focused
					onpick={(id) => (remembered.current = id)}
				/>{/key}
		</div>
	{/if}
</Page>
