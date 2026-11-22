<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';

	/**
	 * What a list, a pane or a page says when there is nothing in it: a quiet icon and a line,
	 * in the middle of the room it has. One look for every empty state; what can be done about
	 * it (a word, a button) goes underneath, as `children`.
	 */
	let {
		icon,
		title,
		children,
		class: extra
	}: { icon?: string; title: string; children?: Snippet; class?: ClassValue } = $props();
</script>

<div
	class={['flex flex-col items-center justify-center gap-3 px-6 py-10 text-center text-sm', extra]}
>
	{#if icon}<span aria-hidden="true" class={[icon, 'size-6 text-muted opacity-60']}></span>{/if}
	<p class="font-medium text-ink">{title}</p>
	{#if children}<div class="flex flex-col items-center gap-3 text-muted">
			{@render children()}
		</div>{/if}
</div>
