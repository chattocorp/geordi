<script lang="ts">
	import { clock, FRAMES, useClock } from './spinner.svelte.ts';

	/** Something is working. `label` says what, for those who can't see it turn. */
	type Props = {
		label?: string;
		/** Takes the colour of the text around it instead of the accent: for inside something coloured. */
		plain?: boolean;
	};
	let { label = 'Working', plain = false }: Props = $props();

	useClock();
</script>

<!-- Not a live region: the frames would be read out, one after the other. -->
<span
	role="img"
	aria-label={label}
	title={label}
	class={['shrink-0 font-mono', !plain && 'text-accent-ink']}
>
	<span aria-hidden="true">{FRAMES[clock.frame]}</span>
</span>
