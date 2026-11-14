<script lang="ts">
	import WorkspaceView from '#lib/components/workspace/WorkspaceView.svelte';

	let { params } = $props();
</script>

<!-- A workspace's windows, layout and terminal are its own: start afresh for each one. -->
{#key params.id}
	<WorkspaceView id={params.id} />
{/key}
