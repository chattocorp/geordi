<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		dir: 'row' | 'column';
		/** The share of the space `a` gets, between 0 and 1. */
		ratio: number;
		a: Snippet;
		b: Snippet;
	};
	let { dir, ratio = $bindable(), a, b }: Props = $props();

	const MIN = 0.12;
	const clamp = (value: number) => Math.min(1 - MIN, Math.max(MIN, value));

	let root: HTMLElement;

	function drag(event: PointerEvent & { currentTarget: HTMLElement }) {
		const handle = event.currentTarget;
		event.preventDefault();
		handle.setPointerCapture(event.pointerId);

		const move = ({ clientX, clientY }: PointerEvent) => {
			const rect = root.getBoundingClientRect();
			ratio = clamp(
				dir === 'row' ? (clientX - rect.left) / rect.width : (clientY - rect.top) / rect.height
			);
		};
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), {
			once: true
		});
	}

	function nudge(event: KeyboardEvent) {
		const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
		if (!step) return;
		event.preventDefault();
		ratio = clamp(ratio + step * 0.02);
	}
</script>

<div bind:this={root} class={['flex min-h-0 min-w-0 flex-1', dir === 'column' && 'flex-col']}>
	<div class="flex min-h-0 min-w-0 flex-col" style:flex="{ratio} 1 0">{@render a()}</div>
	<!-- A focusable separator is a widget (a splitter), which the a11y check doesn't know. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
	<div
		role="separator"
		tabindex="0"
		aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
		aria-valuenow={Math.round(ratio * 100)}
		onpointerdown={drag}
		onkeydown={nudge}
		class={[
			'relative z-10 shrink-0 touch-none bg-line transition-colors select-none after:absolute hover:bg-accent focus-visible:bg-accent',
			dir === 'row'
				? 'w-px cursor-col-resize after:-inset-x-1 after:inset-y-0'
				: 'h-px cursor-row-resize after:inset-x-0 after:-inset-y-1'
		]}
	></div>
	<div class="flex min-h-0 min-w-0 flex-col" style:flex="{1 - ratio} 1 0">{@render b()}</div>
</div>
