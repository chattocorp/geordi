<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A word about something, shown above it while the pointer is on it or it has focus. It
	 * fades in and out: only its opacity changes, so that the fade shows both ways.
	 */
	let { children, tip }: { children: Snippet; tip: Snippet } = $props();
	const id = $props.id();
</script>

<!-- focusable, so that keyboards reach the tip -->
<span class="group/tip relative inline-flex" tabindex="0" aria-describedby={id}>
	{@render children()}
	<span
		{id}
		role="tooltip"
		class="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 card-float px-2.5 py-1.5 text-xs whitespace-nowrap text-ink opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus/tip:opacity-100"
	>
		{@render tip()}
	</span>
</span>
