<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	/**
	 * Something is working. `label` says what, for those who can't see it turn. `still`
	 * quiets it: work goes on, but not the agent's own (its background tasks), so its light
	 * wanders slowly, one dot at a time.
	 */
	type Props = {
		label?: string;
		still?: boolean;
	};
	let { label = 'Working', still = false }: Props = $props();

	/**
	 * The classic Braille dots going round: two columns of three, half of them lit. Drawn
	 * here, not set as Braille characters: fonts draw those with their unlit dots as rings,
	 * and at this size every frame then looks the same. Each dot's place (column, row), in
	 * the order the light passes them.
	 */
	const DOTS = [
		[1, 1],
		[2, 1],
		[2, 2],
		[2, 3],
		[1, 3],
		[1, 2]
	];
	const TURN_MS = 900;

	/**
	 * When standing still, the turn in which each dot (in `DOTS` order) is lit for a moment.
	 * The light never goes to a dot next to the one before, so it seems to wander at random.
	 */
	const STILL_SLOTS = [0, 2, 4, 1, 5, 3];
	const STILL_TURN_MS = 4800;

	/**
	 * All spinners turn together: each joins the turn where the others are in it, also when
	 * it changes between turning and standing still (which starts its animation anew).
	 */
	const inStep: Attachment<HTMLElement> = (node) => {
		void still;
		const now = performance.now();
		node.style.setProperty('--at', `${Math.round(now % TURN_MS)}ms`);
		node.style.setProperty('--still-at', `${Math.round(now % STILL_TURN_MS)}ms`);
	};
</script>

<!--
	Turned by the browser, not by us: it goes round also while the page is busy with
	something else (waiting for the server, say), which is just when it is looked at.
-->
<span
	role="img"
	aria-label={label}
	title={label}
	class={['spinner shrink-0', still && 'still']}
	{@attach inStep}
>
	{#each DOTS as [column, row], index (index)}
		<span style:grid-area="{row} / {column}" style:--i={index} style:--slot={STILL_SLOTS[index]}
		></span>
	{/each}
</span>

<style>
	.spinner {
		display: inline-grid;
		grid-template: repeat(3, 1fr) / repeat(2, 1fr);
		place-items: center;
		width: 0.6em;
		height: 0.9em;
		vertical-align: -0.1em;
	}
	.spinner > span {
		width: 0.19em;
		height: 0.19em;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.2;
		/* lit for half a turn, each a sixth of a turn after the one before */
		animation: lit 900ms steps(1) infinite;
		animation-delay: calc(var(--i) * 150ms - var(--at, 0ms));
	}
	@keyframes lit {
		0% {
			opacity: 1;
		}
		50% {
			opacity: 0.2;
		}
	}
	/* people who prefer reduced motion get a spinner that stands still */
	@media (prefers-reduced-motion: reduce) {
		.spinner > span {
			animation: none;
		}
		.spinner > span:nth-child(-n + 3) {
			opacity: 1;
		}
	}
	/*
		one that stands still lights one dot at a time, each for 0.8s; the six take
		their turns in the order of their slots
	*/
	.spinner.still > span {
		opacity: 0.2;
		animation: glimmer 4800ms steps(1) infinite;
		animation-delay: calc(var(--slot) * 800ms - var(--still-at, 0ms));
	}
	@keyframes glimmer {
		0% {
			opacity: 1;
		}
		16.667% {
			opacity: 0.2;
		}
	}
	/* without motion, it has none of its dots lit */
	@media (prefers-reduced-motion: reduce) {
		.spinner.still > span {
			animation: none;
			opacity: 0.2;
		}
	}
</style>
