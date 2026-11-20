<script lang="ts" module>
	import { getContext, setContext, type Snippet } from 'svelte';

	const SHELL = Symbol('title bar shell');
	type Shell = {
		lead: () => Snippet | undefined;
		onheight?: (height: number) => void;
	};

	/**
	 * Says what every title bar below starts with (`undefined` for nothing). For the app's
	 * shell: the way back to a hidden sidebar, say.
	 */
	export const setTitleBarLead = (lead: Shell['lead'], onheight?: Shell['onheight']) =>
		setContext<Shell>(SHELL, { lead, onheight });
</script>

<script lang="ts">
	type Props = {
		class?: string;
		children?: Snippet;
		actions?: Snippet;
		trailing?: Snippet;
		/** Width of the main sheet, inset two spacing units from the left. The header starts at five. */
		contentWidth?: number;
	};
	let { class: extra, children, actions, trailing, contentWidth }: Props = $props();

	const shell = getContext<Shell | undefined>(SHELL);
</script>

<!--
	The bar at the top of a page: what the page is, and what can be done with it. Every page
	has one, also with nothing to put in it, so that the bar runs across the whole window. It
	starts with what the app's shell puts there. In the desktop app it is what the window is
	dragged by (`window-drag`), except where there is something in it to use, and ends with
	room for the window's buttons where they are drawn over it (`window-controls-room`).
-->
<header
	bind:borderBoxSize={null, (size: ResizeObserverSize[]) => shell?.onheight?.(size[0].blockSize)}
	class={['flex min-h-14 shrink-0 items-center gap-3 bg-frame px-5 select-none window-drag', extra]}
>
	{#snippet heading()}
		{@render shell?.lead()?.()}
		{@render children?.()}
	{/snippet}
	{#if actions}
		<div
			class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 py-2"
			style:max-width={contentWidth === undefined
				? undefined
				: `calc(${contentWidth}px - var(--spacing) * 3)`}
		>
			<div class="flex min-w-0 grow basis-56 items-center gap-3">{@render heading()}</div>
			<div
				class={[
					'flex max-w-full flex-wrap items-center gap-2 empty:hidden',
					contentWidth !== undefined && 'ml-auto'
				]}
			>
				{@render actions()}
			</div>
		</div>
	{:else}
		{@render heading()}
	{/if}
	{#if trailing}
		<div class="ml-auto flex shrink-0 items-center gap-2 empty:hidden">{@render trailing()}</div>
	{/if}
	<span class="hidden window-controls-room desktop:block mac:hidden"></span>
</header>
