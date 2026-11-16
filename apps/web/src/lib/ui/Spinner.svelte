<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	/** Something is working. `label` says what, for those who can't see it turn. */
	type Props = {
		label?: string;
		/** Takes the colour of the text around it instead of the accent: for inside something coloured. */
		plain?: boolean;
	};
	let { label = 'Working', plain = false }: Props = $props();

	/** The classic Braille dots going round. */
	const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
	const TURN_MS = 800;

	/** All spinners turn together: each joins the turn where the others are in it. */
	const inStep: Attachment<HTMLElement> = (node) => {
		node.style.animationDelay = `-${Math.round(performance.now() % TURN_MS)}ms`;
	};
</script>

<!--
	Turned by the browser, not by us: it goes round also while the page is busy with
	something else (waiting for the server, say), which is just when it is looked at.
	Not a live region: the frames would be read out, one after the other.
-->
<span
	role="img"
	aria-label={label}
	title={label}
	class={['spinner shrink-0 font-mono', !plain && 'text-accent-ink']}
>
	<span class="frames" aria-hidden="true" {@attach inStep}>
		{#each FRAMES as frame (frame)}<span>{frame}</span>{/each}
	</span>
</span>

<style>
	/* A window one frame high onto a strip of all of them, which moves up a frame at a time. */
	.spinner {
		display: inline-block;
		height: 1em;
		overflow: hidden;
		line-height: 1;
		vertical-align: -0.125em;
	}
	.frames {
		display: flex;
		flex-direction: column;
		animation: turn 800ms steps(10) infinite;
	}
	.frames > span {
		height: 1em;
		line-height: 1em;
	}
	@keyframes turn {
		to {
			transform: translateY(-100%);
		}
	}
	/* people who prefer reduced motion get a spinner that stands still */
	@media (prefers-reduced-motion: reduce) {
		.frames {
			animation: none;
		}
	}
</style>
