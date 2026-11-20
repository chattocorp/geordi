<script lang="ts">
	import DiffWindow from './DiffWindow.svelte';

	let { workspaceId, path, version }: { workspaceId: string; path: string; version: number } =
		$props();

	// Only request whole file versions when the reader reaches this part of the diff.
	let reached = $state(false);
	function observe(node: HTMLElement) {
		const observer = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting) reached = true;
		});
		observer.observe(node);
		return () => observer.disconnect();
	}
</script>

{#if reached}
	<DiffWindow {workspaceId} {path} {version} />
{:else}
	<p class="p-5 text-sm text-muted" {@attach observe}>Loading the diff…</p>
{/if}
