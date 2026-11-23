<script lang="ts">
	import type { OnTools } from './window-tools.svelte.ts';
	import FileView from './FileView.svelte';
	import ProgressIcon from '@geordi/ui/ProgressIcon.svelte';
	import { getDiff } from '../../../routes/workspaces.remote';

	type Props = {
		workspaceId: string;
		path: string;
		/**
		 * Something that is different whenever the file may have changed: the cue to load it
		 * again.
		 */
		version: string | number;
		/** Called while the file is shown, with what can be done with it from the tab bar. */
		ontools?: OnTools;
	};
	let { workspaceId, path, version, ontools }: Props = $props();

	const versions = $derived(getDiff({ workspaceId, path }));

	// Compared as a value: the data it is derived from is new with every update.
	const current = $derived(version);
	$effect(() => {
		void current;
		versions.refresh();
	});
</script>

{#snippet loading()}
	<p class="flex items-center gap-2 p-5 text-sm text-muted" role="status">
		<ProgressIcon label="Loading the diff" /> Loading the diff…
	</p>
{/snippet}

{#if !versions.current}
	{@render loading()}
{:else if 'unavailable' in versions.current}
	<p class="p-5 text-sm text-muted">{versions.current.unavailable}</p>
{:else}
	<FileView
		{path}
		old={versions.current.old}
		current={versions.current.new}
		{ontools}
		pictures={`/workspaces/${workspaceId}/picture?file&v=${version}`}
	/>
{/if}
