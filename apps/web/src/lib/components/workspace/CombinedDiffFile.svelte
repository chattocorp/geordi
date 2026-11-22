<script lang="ts">
	import type { OnTools } from './window-tools.svelte.ts';
	import DiffWindow from './DiffWindow.svelte';

	let {
		workspaceId,
		path,
		version,
		ontools
	}: {
		workspaceId: string;
		path: string;
		version: number;
		/** Called while the file is shown, with what can be done with it from the tab bar. */
		ontools?: OnTools;
	} = $props();

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
	<DiffWindow {workspaceId} {path} {version} {ontools} />
{:else}
	<p class="p-5 text-sm text-muted" {@attach observe}>Loading the diff…</p>
{/if}
