<script lang="ts">
	import { resolve } from '$app/paths';
	import { daemon } from '#lib/daemon.svelte.ts';
	import { needsPlate } from './repo-icon.ts';

	/**
	 * What stands for a repository beside its name: the picture it has of itself (a favicon,
	 * a logo), where it has one; a folder otherwise, and until that is known.
	 */
	let { id, small = false }: { id: string; small?: boolean } = $props();

	let loaded = $state(false);
	let failed = $state(false);
	let plate = $state(false);
	/**
	 * Asked once; asked again, where that found nothing, each time a daemon connects: no
	 * daemon may have been there to say, the first time.
	 */
	const src = $derived(
		resolve('/repos/[id]/icon', { id }) + (failed ? `?daemon=${daemon.connections}` : '')
	);
</script>

<span class={['relative grid shrink-0 place-items-center', small ? 'size-4' : 'size-5']}>
	{#if !loaded}<span
			class={['icon-[lucide--folder-git-2] text-muted/70', small ? 'size-4' : 'size-4.5']}
		></span>{/if}
	<span class={['absolute inset-0 picture-raised', !loaded && 'invisible']}>
		<img
			{src}
			alt=""
			class={['block size-full rounded-control object-contain', plate && 'picture-plate']}
			onload={(event) => {
				plate = needsPlate(event.currentTarget as HTMLImageElement);
				loaded = true;
			}}
			onerror={() => {
				loaded = false;
				failed = true;
			}}
		/>
		<!-- the sheen, in the picture's own shape (or the plate's, where it has one) -->
		<span
			class={['absolute inset-0 rounded-control picture-gloss', plate && 'dark:mask-none']}
			style:--picture="url({src})"
		></span>
	</span>
</span>
