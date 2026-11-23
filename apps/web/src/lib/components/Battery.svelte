<script lang="ts">
	import type { Tone } from '#lib/limits.ts';
	import { lba } from '#lib/lba.svelte.ts';

	/**
	 * What is left of a usage limit, drawn like a phone's battery: what is there in its tone;
	 * what is gone, and the casing, faint. Without a `label`, it only illustrates the words
	 * beside it. Not drawn at all in low battery anxiety mode (`lba`).
	 */
	let { left, tone, label }: { left: number; tone: Tone; label?: string } = $props();

	const fills: Record<Tone, string> = {
		normal: 'fill-muted',
		warning: 'fill-warning',
		danger: 'fill-danger'
	};
</script>

{#if !lba.on}<svg
		viewBox="0 0 32 20"
		class="block h-5 w-8 shrink-0"
		role={label ? 'img' : undefined}
		aria-label={label}
		aria-hidden={!label}
	>
		<rect
			x="2"
			y="3.5"
			width="25"
			height="13"
			rx="4"
			class="fill-none stroke-muted/30"
			stroke-width="2"
		/>
		<rect x="29" y="7.5" width="2" height="5" rx="1" class="fill-muted/30" />
		<rect x="4.5" y="6" width={20 * left} height="8" rx="1.5" class={fills[tone]} />
	</svg>{/if}
