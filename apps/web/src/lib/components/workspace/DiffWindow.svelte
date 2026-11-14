<script lang="ts">
	import DiffView from '#lib/components/DiffView.svelte';
	import { getChanges, getDiff } from '../../../routes/workspaces.remote';

	let { workspaceId, path }: { workspaceId: string; path: string } = $props();

	const versions = $derived(getDiff({ workspaceId, path }));

	// Reload when the changes pane (which polls) sees this file's line counts change. The
	// counts are compared as one value: the list itself is new on every poll.
	const changes = $derived(getChanges(workspaceId));
	const counts = $derived.by(() => {
		const file = changes.current?.files.find((file) => file.path === path);
		return `${file?.added} ${file?.removed}`;
	});
	$effect(() => {
		void counts;
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
