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
	// an item of the outline to start it on (FDR-017), while it has no workspace yet
	const item = $derived.by(() => {
		const id = page.url.searchParams.get('item');
		const found = nav?.items.find((each) => each.id === id && !each.workspace);
		return found && { id: found.id, text: found.text };
	});
</script>

<Page title="New workspace" wide>
	{#snippet description()}
		{#if item}
			Start a workspace on “{item.text || 'an item'}”: it is named after it, and works where it is
			in the outline.
		{:else}
			Tell an agent what to do. It gets its own branch to do it on.
		{/if}
	{/snippet}

	{#if !nav}
		<WaitingForView lost={connection.state === 'lost'} />
	{:else}
		<div class="flex flex-1 flex-col justify-center">
			{#key page.url.search}<NewWorkspace
					repos={nav.repos}
					{preferred}
					{issue}
					{item}
					focused
					onpick={(id) => (remembered.current = id)}
				/>{/key}
		</div>
	{/if}
</Page>
