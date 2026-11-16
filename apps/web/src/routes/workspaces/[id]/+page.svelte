<script lang="ts">
	import WorkspaceView from '#lib/components/workspace/WorkspaceView.svelte';
	import { ownParam } from '#lib/route.svelte.ts';

	let { params } = $props();
	// not another route's `id`, which this page sees while it is being left (see `ownParam`)
	const id = ownParam('/workspaces/[id]', () => params.id);
</script>

<!-- A workspace's windows, layout and terminal are its own: start afresh for each one. -->
{#key id.current}
	<WorkspaceView id={id.current} />
{/key}
