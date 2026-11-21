<script module lang="ts">
	let context: CanvasRenderingContext2D | null | undefined;
	/**
	 * Widths already measured, by font and text: shared by every path shown, so that a long
	 * list (or a pane being resized) measures each text once. Started over when fonts load.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never shown
	const widths = new Map<string, number>();
	/** Counts the fonts that finished loading, so that paths are fitted again with them. */
	let fontsLoaded = $state(0);
	let listening = false;

	function width(font: string, text: string) {
		const key = `${font}\n${text}`;
		let found = widths.get(key);
		if (found === undefined) {
			// (a long session would otherwise keep every text it ever fitted)
			if (widths.size > 10_000) widths.clear();
			context!.font = font;
			widths.set(key, (found = context!.measureText(text).width));
		}
		return found;
	}
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
	let font = $state<string>();
	const measure = $derived.by(() => {
		void fontsLoaded;
		const used = font;
		return used ? (text: string) => width(used, text) : undefined;
	});

	onMount(() => {
		context ??= document.createElement('canvas').getContext('2d');
		if (!context) return;
		if (!listening) {
			listening = true;
			document.fonts.addEventListener('loadingdone', () => {
				widths.clear();
				fontsLoaded++;
			});
		}
		const style = getComputedStyle(element);
		font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
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
