<script lang="ts" module>
	import { getContext, setContext, type Snippet } from 'svelte';

	const LEAD = Symbol('title bar lead');

	/**
	 * Says what every title bar below starts with (`undefined` for nothing). For the app's
	 * shell: the way back to a hidden sidebar, say.
	 */
	export const setTitleBarLead = (lead: () => Snippet | undefined) => setContext(LEAD, lead);
</script>

<script lang="ts">
	type Props = { class?: string; children?: Snippet };
	let { class: extra, children }: Props = $props();

	const lead = getContext<(() => Snippet | undefined) | undefined>(LEAD);
</script>

<!--
	The bar at the top of a page: what the page is, and what can be done with it. Every page
	has one, also with nothing to put in it, so that the bar runs across the whole window. It
	starts with what the app's shell puts there. In the desktop app it is what the window is
	dragged by (`window-drag`), except where there is something in it to use.
-->
<header class={['flex h-14 shrink-0 items-center gap-3 bg-frame px-5 window-drag', extra]}>
	{@render lead?.()?.()}
	{@render children?.()}
</header>
