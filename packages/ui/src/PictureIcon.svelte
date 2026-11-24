<script lang="ts">
	import type { Snippet } from 'svelte';
	import { needsPlate } from './picture.ts';

	/**
	 * A small picture that stands for something beside its name (a repository, a section of
	 * one): raised, with a sheen in its own shape, and on a pale plate where it is a dark mark
	 * without a background of its own. Until it has loaded, or where it can't be (`failed`),
	 * `fallback` shows instead.
	 */
	let {
		src,
		small = false,
		failed = $bindable(false),
		fallback
	}: {
		src: string;
		small?: boolean;
		failed?: boolean;
		fallback?: Snippet<[failed: boolean]>;
	} = $props();

	let loaded = $state(false);
	let plate = $state(false);
</script>

<span class={['relative grid shrink-0 place-items-center', small ? 'size-4' : 'size-5']}>
	{#if !loaded}{@render fallback?.(failed)}{/if}
	<span class={['absolute inset-0 picture-raised', !loaded && 'invisible']}>
		<img
			{src}
			alt=""
			class={['block size-full rounded-control object-contain', plate && 'picture-plate']}
			onload={(event) => {
				plate = needsPlate(event.currentTarget as HTMLImageElement);
				loaded = true;
				failed = false;
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
