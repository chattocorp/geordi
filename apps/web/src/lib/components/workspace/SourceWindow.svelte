<script lang="ts">
	import { getSource } from '../../../routes/workspaces.remote';
	import SourceView from './SourceView.svelte';

	let {
		workspaceId,
		path,
		citation,
		version
	}: { workspaceId: string; path: string; version: string | number; citation?: { line?: number } } =
		$props();
	const file = $derived(getSource({ workspaceId, path }));
	// The daemon reports when a worktree file may have changed, just as for a diff.
	$effect(() => {
		void version;
		file.refresh();
	});
</script>

{#if file.current?.text !== undefined}
	{#key citation}
		<SourceView text={file.current.text} line={citation?.line} />
	{/key}
{:else}
	<p class="p-5 text-sm text-muted" role="status">
		{file.current?.unavailable ?? 'Loading the file…'}
	</p>
{/if}
