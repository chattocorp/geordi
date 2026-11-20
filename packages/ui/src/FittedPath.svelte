<script module lang="ts">
	let context: CanvasRenderingContext2D | null;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import type { ClassValue } from 'svelte/elements';
	import { fitPath } from './paths.ts';

	/**
	 * A path, shortened to fit its width (`fitPath`): the directories muted, their
	 * slashes fainter still, the name in full as long as it can be.
	 */
	let { path, class: className }: { path: string; class?: ClassValue } = $props();

	let room = $state<DOMRectReadOnly>();
	let element: HTMLSpanElement;
	let measure = $state<(text: string) => number>();

	onMount(() => {
		context ??= document.createElement('canvas').getContext('2d');
		if (!context) return;

		function useFont() {
			const style = getComputedStyle(element);
			const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
			measure = (text) => {
				context!.font = font;
				return context!.measureText(text).width;
			};
		}

		useFont();
		document.fonts.addEventListener('loadingdone', useFont);
		return () => document.fonts.removeEventListener('loadingdone', useFont);
	});
	const fitted = $derived(fitPath(path, measure && room ? room.width : Infinity, measure));
</script>

<span class={['flex min-w-0 flex-1', className]} bind:this={element} bind:contentRect={room}>
	{#if fitted.dirs.length > 0}
		<span class="shrink-0 text-muted">
			{#each fitted.dirs as dir, i (i)}{dir}<span class="opacity-30">/</span>{/each}
		</span>
	{/if}
	<span class="min-w-0 truncate">{fitted.name}</span>
</span>
