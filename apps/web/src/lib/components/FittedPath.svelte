<script lang="ts">
	import type { ClassValue } from 'svelte/elements';
	import { fitPath } from '#lib/paths.ts';

	/**
	 * A path in monospace, shortened to fit its width (`fitPath`): the directories muted, their
	 * slashes fainter still, the name in full as long as it can be.
	 */
	let { path, class: className }: { path: string; class?: ClassValue } = $props();

	let room = $state<DOMRectReadOnly>();
	/** Ten characters: the font is monospace, so each is a tenth of their width (unrounded). */
	let ten = $state<DOMRectReadOnly>();
	const columns = $derived(
		room && ten?.width ? Math.floor((room.width * 10) / ten.width) : Infinity
	);
	const fitted = $derived(fitPath(path, columns));
</script>

<span class={['relative flex min-w-0 flex-1', className]} bind:contentRect={room}>
	<span class="invisible absolute" aria-hidden="true" bind:contentRect={ten}>0000000000</span>
	{#if fitted.dirs.length > 0}
		<span class="shrink-0 text-muted">
			{#each fitted.dirs as dir, i (i)}{dir}<span class="opacity-30">/</span>{/each}
		</span>
	{/if}
	<span class="min-w-0 truncate">{fitted.name}</span>
</span>
