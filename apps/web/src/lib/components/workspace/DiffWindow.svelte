<script lang="ts">
	import DiffView from '#lib/components/DiffView.svelte';
	import { getChanges, getDiff } from '../../../routes/workspaces.remote';

	let { workspaceId, path }: { workspaceId: string; path: string } = $props();

	const versions = $derived(getDiff({ workspaceId, path }));

	// Reload whenever the changes pane (which polls) sees this file change.
	const changes = $derived(getChanges(workspaceId));
	const stats = $derived(changes.current?.files.find((file) => file.path === path));
	$effect(() => {
		void [stats?.added, stats?.removed];
		versions.refresh();
	});
</script>

<div class="scroller">
	{#if !versions.current}
		<p class="p-5 text-sm text-muted">Loading…</p>
	{:else if 'unavailable' in versions.current}
		<p class="p-5 text-sm text-muted">{versions.current.unavailable}</p>
	{:else}
		<DiffView {path} old={versions.current.old} new={versions.current.new} />
	{/if}
</div>
