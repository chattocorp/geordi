<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	/**
	 * Something is working. `label` says what, for those who can't see it turn. `still`
	 * stands it still, all dots unlit: work goes on, but not the agent's own (its background tasks).
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

	/** All spinners turn together: each joins the turn where the others are in it. */
	const inStep: Attachment<HTMLElement> = (node) => {
		node.style.setProperty('--at', `${Math.round(performance.now() % TURN_MS)}ms`);
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
		<span style:grid-area="{row} / {column}" style:--i={index}></span>
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
	/* one that stands still has none of its dots lit, whatever the preference */
	.spinner.still > span {
		animation: none;
		opacity: 0.2;
	}
</style>
