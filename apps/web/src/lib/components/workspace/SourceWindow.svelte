<script lang="ts">
	import type { OnTools } from './window-tools.svelte.ts';
	import { getSource } from '../../../routes/workspaces.remote';
	import FileView from './FileView.svelte';
	import Loading from '@geordi/ui/Loading.svelte';

	let {
		workspaceId,
		path,
		citation,
		version,
		ontools
	}: {
		workspaceId: string;
		path: string;
		version: string | number;
		citation?: { line?: number };
		/** Called while the file is shown, with what can be done with it from the tab bar. */
		ontools?: OnTools;
	} = $props();
	const file = $derived(getSource({ workspaceId, path }));
	// The daemon reports when a worktree file may have changed, just as for a diff.
	$effect(() => {
		void version;
		file.refresh();
	});
</script>

{#if file.current?.content !== undefined}
	{#key citation}
		<FileView
			{path}
			current={file.current.content}
			pictures={`/workspaces/${workspaceId}/picture?file&v=${version}`}
			line={citation?.line}
			{ontools}
		/>
	{/key}
{:else}
	{#if file.current?.unavailable}
		<p class="p-5 text-sm text-muted">{file.current.unavailable}</p>
	{:else}
		<Loading label="Loading the file…" />
	{/if}
{/if}
