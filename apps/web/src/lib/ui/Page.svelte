<script lang="ts">
	import TitleBar from './TitleBar.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		/** A line under the title. */
		description?: Snippet;
		children: Snippet;
	};
	let { title, description, children }: Props = $props();
</script>

<svelte:head><title>{title} · Geordi</title></svelte:head>

<!--
	A page with a title: in its title bar, as on every page, with the description as the line
	beneath. On small screens, where the layout has a bar of its own, both head the content.
-->
<TitleBar class="hidden md:flex">
	<div class="min-w-0">
		<h1 class="truncate heading">{title}</h1>
		{#if description}<div class="truncate text-xs text-muted">{@render description()}</div>{/if}
	</div>
</TitleBar>
<main class="page">
	<header class="space-y-1 md:hidden">
		<h1 class="title">{title}</h1>
		{#if description}<div class="text-muted">{@render description()}</div>{/if}
	</header>
	{@render children()}
</main>
