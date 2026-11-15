<script lang="ts">
	import { clock, FRAMES, useClock } from './spinner.svelte.ts';

	/** Something is working. `label` says what, for those who can't see it turn. */
	let { label = 'Working' }: { label?: string } = $props();

	useClock();
</script>

<span role="status" aria-label={label} title={label} class="shrink-0 font-mono text-accent-ink">
	{FRAMES[clock.frame]}
</span>
