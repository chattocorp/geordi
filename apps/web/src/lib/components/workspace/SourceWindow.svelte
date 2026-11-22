<script lang="ts">
	import { getSource } from '../../../routes/workspaces.remote';
	import FileView from './FileView.svelte';

	let {
		workspaceId,
		path,
		citation,
		version,
		onwrappable
	}: {
		workspaceId: string;
		path: string;
		version: string | number;
		citation?: { line?: number };
		/** Called while long lines could wrap here (text is shown); returns what undoes it. */
		onwrappable?: () => () => void;
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
			{onwrappable}
		/>
	{/key}
{:else}
	<p class="p-5 text-sm text-muted" role="status">
		{file.current?.unavailable ?? 'Loading the file…'}
	</p>
{/if}
