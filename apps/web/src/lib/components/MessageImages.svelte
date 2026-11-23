<script lang="ts">
	import { resolve } from '$app/paths';
	import ImageViewer from '#lib/ui/ImageViewer.svelte';

	let { images = [] }: { images?: string[] } = $props();
	let viewing = $state<{ src: string; alt: string } | null>(null);
</script>

{#if images.length}
	<div class="flex flex-wrap gap-2 pt-2">
		{#each images as image, index (`${image}:${index}`)}
			{@const src = resolve('/images/[id]', { id: image })}
			{@const alt = `Attached image ${index + 1}`}
			<button
				type="button"
				aria-label={`Open image ${index + 1}`}
				onclick={() => (viewing = { src, alt })}
			>
				<img {src} {alt} loading="lazy" class="max-h-48 max-w-64 rounded-control object-contain" />
			</button>
		{/each}
	</div>
{/if}

{#if viewing}<ImageViewer {...viewing} onclose={() => (viewing = null)} />{/if}
