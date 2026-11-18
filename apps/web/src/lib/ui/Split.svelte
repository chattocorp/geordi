<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		dir: 'row' | 'column';
		/** The share of the space `a` gets, between 0 and 1. */
		ratio: number;
		/** Minimum share reserved for the first pane. */
		minRatio?: number;
		a: Snippet;
		b: Snippet;
		/** Hides `b` (and the divider), giving `a` all the room. `b` stays alive meanwhile. */
		collapsed?: boolean;
		/**
		 * The least room, in pixels, that `a` and `b` need to be of use. A share is a share of
		 * whatever room there is: in a small window it alone would squeeze them to nothing.
		 */
		min?: [a: number, b: number];
		/** No line between the two: for where their shapes already set them apart. */
		bare?: boolean;
	};
	let {
		dir,
		ratio = $bindable(),
		a,
		b,
		collapsed = false,
		min = [0, 0],
		minRatio = 0.12,
		bare = false
	}: Props = $props();

	const share = $derived(Math.max(minRatio, ratio));
	/** Keeps a share within what leaves both sides their least room, of `size` pixels in all. */
	function clamp(value: number, size = root.getBoundingClientRect()[extent]) {
		const least = Math.max(minRatio, min[0] / size);
		const most = Math.min(0.88, 1 - min[1] / size);
		// too little room for both: no dragging will help
		return least > most ? share : Math.min(most, Math.max(least, value));
	}
	const extent = $derived(dir === 'row' ? 'width' : 'height');

	let root: HTMLElement;

	function drag(event: PointerEvent & { currentTarget: HTMLElement }) {
		const handle = event.currentTarget;
		event.preventDefault();
		handle.setPointerCapture(event.pointerId);

		const move = ({ clientX, clientY }: PointerEvent) => {
			const rect = root.getBoundingClientRect();
			ratio = clamp(
				dir === 'row' ? (clientX - rect.left) / rect.width : (clientY - rect.top) / rect.height,
				rect[extent]
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
		ratio = clamp(share + step * 0.02);
	}
</script>

<div bind:this={root} class={['flex min-h-0 min-w-0 flex-1', dir === 'column' && 'flex-col']}>
	<!-- a share below 1 would leave room unused once `b` is hidden -->
	<div
		class="flex min-h-0 min-w-0 flex-col"
		style:flex="{collapsed ? 1 : share} 1 0"
		style:min-width={dir === 'row' ? `${min[0]}px` : undefined}
		style:min-height={dir === 'column' ? `${min[0]}px` : undefined}
	>
		{@render a()}
	</div>
	<!-- A focusable separator is a widget (a splitter), which the a11y check doesn't know. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
	<div
		role="separator"
		tabindex="0"
		aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
		aria-valuenow={Math.round(share * 100)}
		onpointerdown={drag}
		onkeydown={nudge}
		class={[
			collapsed && 'hidden',
			!bare && 'bg-line',
			'relative z-10 shrink-0 touch-none select-none after:absolute focus-visible:bg-accent',
			dir === 'row'
				? 'w-px cursor-col-resize after:-inset-x-1 after:inset-y-0'
				: 'h-px cursor-row-resize after:inset-x-0 after:-inset-y-1'
		]}
	></div>
	<div
		class={['min-h-0 min-w-0 flex-col', collapsed ? 'hidden' : 'flex']}
		style:flex="{1 - share} 1 0"
		style:min-width={dir === 'row' ? `${min[1]}px` : undefined}
		style:min-height={dir === 'column' ? `${min[1]}px` : undefined}
	>
		{@render b()}
	</div>
</div>
