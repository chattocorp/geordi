<script lang="ts">
	import { resolve } from '$app/paths';

	/**
	 * What stands for a repository beside its name: the picture it has of itself (a favicon,
	 * a logo), where it has one; a folder otherwise, and until that is known.
	 */
	let { id }: { id: string } = $props();

	let loaded = $state(false);
</script>

<span class="relative grid size-5 shrink-0 place-items-center">
	{#if !loaded}<span class="icon-[lucide--folder-git-2] size-4.5 text-muted/70"></span>{/if}
	<img
		src={resolve('/repos/[id]/icon', { id })}
		alt=""
		class={['absolute inset-0 size-5 rounded-control object-contain', !loaded && 'invisible']}
		onload={() => (loaded = true)}
		onerror={() => (loaded = false)}
	/>
</span>
