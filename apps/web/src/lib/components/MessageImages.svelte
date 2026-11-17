<script lang="ts">
	import { resolve } from '$app/paths';
	let { images = [] }: { images?: string[] } = $props();
</script>

{#if images.length}
	<div class="flex flex-wrap gap-2 pt-2">
		{#each images as image, index (`${image}:${index}`)}
			<a
				href={resolve('/images/[id]', { id: image })}
				target="_blank"
				rel="noreferrer"
				aria-label={`Open image ${index + 1}`}
			>
				<img
					src={resolve('/images/[id]', { id: image })}
					alt={`Attached image ${index + 1}`}
					loading="lazy"
					class="max-h-48 max-w-64 rounded-control object-contain"
				/>
			</a>
		{/each}
	</div>
{/if}
