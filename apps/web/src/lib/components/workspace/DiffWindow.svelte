<script lang="ts">
	import DiffView from '#lib/components/DiffView.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import { getDiff } from '../../../routes/workspaces.remote';

	type Props = {
		workspaceId: string;
		path: string;
		/**
		 * Something that is different whenever the file may have changed: the cue to load it
		 * again.
		 */
		version: string | number;
	};
	let { workspaceId, path, version }: Props = $props();

	const versions = $derived(getDiff({ workspaceId, path }));

	/** Whether the diff itself is on screen: its viewer takes a moment the first time. */
	let ready = $state(false);

	// Compared as a value: the data it is derived from is new with every update.
	const current = $derived(version);
	$effect(() => {
		void current;
		versions.refresh();
	});
</script>

{#snippet loading()}
	<p class="flex items-center gap-2 p-5 text-sm text-muted" role="status">
		<Spinner label="Loading the diff" /> Loading the diff…
	</p>
{/snippet}

<div class="scroller">
	{#if !versions.current}
		{@render loading()}
	{:else if 'unavailable' in versions.current}
		<p class="p-5 text-sm text-muted">{versions.current.unavailable}</p>
	{:else if versions.current.old === versions.current.new}
		<!-- renamed or moved, and otherwise as it was -->
		<p class="p-5 text-sm text-muted">The file's content is unchanged.</p>
	{:else}
		{#if !ready}{@render loading()}{/if}
		<DiffView {path} old={versions.current.old} new={versions.current.new} bind:ready />
	{/if}
</div>
