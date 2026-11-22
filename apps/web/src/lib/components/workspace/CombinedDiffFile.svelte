<script lang="ts">
	import DiffWindow from './DiffWindow.svelte';

	let {
		workspaceId,
		path,
		version,
		onwrappable
	}: {
		workspaceId: string;
		path: string;
		version: number;
		/** Called while long lines could wrap here (text is shown); returns what undoes it. */
		onwrappable?: () => () => void;
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
	<DiffWindow {workspaceId} {path} {version} {onwrappable} />
{:else}
	<p class="p-5 text-sm text-muted" {@attach observe}>Loading the diff…</p>
{/if}
