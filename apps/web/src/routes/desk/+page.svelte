<script lang="ts">
	import NewWorkspace from '#lib/components/workspace/NewWorkspace.svelte';
	import Page from '#lib/ui/Page.svelte';
	import WaitingForView from '#lib/components/WaitingForView.svelte';
	import { connection, follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';

	const live = follow<Navigation>('navigation');
	const nav = $derived(live.current);
</script>

<!-- The Desk (FDR-012), before anything is said there: an agent that orchestrates the others. -->
<Page title="The Desk" wide>
	{#snippet description()}
		Tell an agent what you want done. It hands the work to agents in your repositories, and keeps
		track of them for you.
	{/snippet}

	{#if !nav}
		<WaitingForView lost={connection.state === 'lost'} />
	{:else}
		<div class="flex flex-1 flex-col justify-center">
			<NewWorkspace repos={nav.repos} desk focused />
		</div>
	{/if}
</Page>
