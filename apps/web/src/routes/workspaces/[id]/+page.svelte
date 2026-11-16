<script lang="ts">
	import WorkspaceView from '#lib/components/workspace/WorkspaceView.svelte';
	import { follow } from '#lib/live.svelte.ts';
	import { ownParam } from '#lib/route.svelte.ts';
	import type { WorkspaceLive } from '#lib/server/views.ts';
	import Page from '#lib/ui/Page.svelte';

	let { params } = $props();
	// not another route's `id`, which this page sees while it is being left (see `ownParam`)
	const id = ownParam('/workspaces/[id]', () => params.id);
	const live = follow<WorkspaceLive>('workspace', () => id.current);
	// the one asked for, not for a moment the one that was on screen before
	const workspace = $derived(live.current?.id === id.current ? live.current : undefined);
</script>

<!-- A workspace's windows, layout and terminal are its own: start afresh for each one. -->
{#key id.current}
	{#if workspace}
		<WorkspaceView {workspace} connected={live.connected} />
	{:else if live.error}
		<Page title={live.error.status === 404 ? 'No such workspace' : 'Something went wrong'}>
			<p class="text-sm text-muted">{live.error.message}</p>
		</Page>
	{/if}
{/key}
