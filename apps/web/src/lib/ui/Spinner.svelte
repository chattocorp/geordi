<script lang="ts">
	import { clock, FRAMES, useClock } from './spinner.svelte.ts';

	/** Something is working. `label` says what, for those who can't see it turn. */
	let { label = 'Working' }: { label?: string } = $props();

	useClock();
</script>

<!-- Not a live region: the frames would be read out, one after the other. -->
<span role="img" aria-label={label} title={label} class="shrink-0 font-mono text-accent-ink">
	<span aria-hidden="true">{FRAMES[clock.frame]}</span>
</span>
