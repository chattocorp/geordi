<script lang="ts" module>
	import { getContext, setContext, type Snippet } from 'svelte';

	const SHELL = Symbol('title bar shell');
	type Lead = () => Snippet | undefined;

	/**
	 * Says what every title bar below starts with (`undefined` for nothing). For the app's
	 * shell: the way back to a hidden sidebar, say.
	 */
	export const setTitleBarLead = (lead: Lead) => setContext(SHELL, lead);
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

	const lead = getContext<Lead | undefined>(SHELL);
</script>

<!--
	The bar at the top of a page: what the page is, and what can be done with it. Every page
	has one, also with nothing to put in it, so that the bar runs across the whole window. It
	starts with what the app's shell puts there. In the desktop app it is what the window is
	dragged by (`window-drag`), except where there is something in it to use, and ends with
	room for the window's buttons where they are drawn over it (`window-controls-room`).
-->
<header
	class={['flex min-h-14 shrink-0 items-center gap-3 bg-frame px-5 select-none window-drag', extra]}
>
	{#snippet heading()}
		{@render lead?.()?.()}
		{@render children?.()}
	{/snippet}
	{#if actions}
		<div
			class="@container/titlebar flex min-w-0 flex-1 items-center gap-3 py-1"
			style:max-width={contentWidth === undefined
				? undefined
				: `calc(${contentWidth}px - var(--spacing) * 3)`}
		>
			<div class="flex min-w-0 flex-1 items-center gap-3">{@render heading()}</div>
			<div class="scrollbar-none max-w-5/6 overflow-x-auto empty:hidden">
				<div class="flex w-max items-center gap-2">{@render actions()}</div>
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
