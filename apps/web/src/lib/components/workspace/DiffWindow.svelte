<script lang="ts">
	import DiffView from '#lib/components/DiffView.svelte';
	import { getDiff } from '../../../routes/workspaces.remote';

	type Props = {
		workspaceId: string;
		path: string;
		/**
		 * Something that is different whenever the file has changed (its line counts, say):
		 * the cue to load it again.
		 */
		version: string;
	};
	let { workspaceId, path, version }: Props = $props();

	const versions = $derived(getDiff({ workspaceId, path }));

	// Compared as a value: the data it is derived from is new with every update.
	const current = $derived(version);
	$effect(() => {
		void current;
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
