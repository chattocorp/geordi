<script lang="ts">
	import { resolve } from '$app/paths';

	/**
	 * What stands for a repository beside its name: the picture it has of itself (a favicon,
	 * a logo), where it has one; a folder otherwise, and until that is known.
	 */
	let { id, small = false }: { id: string; small?: boolean } = $props();

	let loaded = $state(false);
</script>

<span class={['relative grid shrink-0 place-items-center', small ? 'size-4' : 'size-5']}>
	{#if !loaded}<span
			class={['icon-[lucide--folder-git-2] text-muted/70', small ? 'size-4' : 'size-4.5']}
		></span>{/if}
	<img
		src={resolve('/repos/[id]/icon', { id })}
		alt=""
		class={['absolute inset-0 size-full rounded-control object-contain', !loaded && 'invisible']}
		onload={() => (loaded = true)}
		onerror={() => (loaded = false)}
	/>
</span>
