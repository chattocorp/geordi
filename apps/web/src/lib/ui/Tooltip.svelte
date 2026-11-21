<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A word about something, shown above it while the pointer is on it or it has focus. It
	 * fades in and out: only its opacity changes, so that the fade shows both ways. It is
	 * placed by CSS anchor positioning, fixed to the window: a sheet that clips what overflows
	 * it does not cut it off, and where there is no room to its right or above, it flips. (A
	 * `transform` on an ancestor would make it fixed to that one instead, and clip it again.)
	 */
	let { children, tip }: { children: Snippet; tip: Snippet } = $props();
	const id = $props.id();
</script>

<!-- focusable, so that keyboards reach the tip -->
<span class="group/tip inline-flex" tabindex="0" aria-describedby={id} style:anchor-name="--{id}">
	{@render children()}
	<span
		{id}
		role="tooltip"
		style:position-anchor="--{id}"
		style:position-area="top span-right"
		style:position-try-fallbacks="flip-inline, flip-block, flip-block flip-inline"
		style:position-visibility="anchors-visible"
		class="pointer-events-none fixed z-10 my-1.5 card-float px-2.5 py-1.5 text-xs whitespace-nowrap text-ink opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus/tip:opacity-100"
	>
		{@render tip()}
	</span>
</span>
