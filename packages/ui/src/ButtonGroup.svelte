<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** What the buttons are, together: the group's accessible name. */
		label: string;
		/** `Button`s, which become segments of one pill. */
		children: Snippet;
	};
	let { label, children }: Props = $props();
</script>

<!--
	Buttons joined into one pill, a pixel apart: one thing with several ways to go,
	rather than several things. Each keeps its own variant, so the main one still stands out.
-->
<div
	role="group"
	aria-label={label}
	class="inline-flex max-w-full shrink-0 flex-wrap gap-px overflow-hidden rounded-full *:rounded-none"
>
	{@render children()}
</div>
