<script lang="ts">
	import TitleBar from './TitleBar.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		/** A line under the title. */
		description?: Snippet;
		/** For pages that lay out cards side by side. */
		wide?: boolean;
		children: Snippet;
	};
	let { title, description, wide = false, children }: Props = $props();
</script>

<svelte:head><title>{title} · Geordi</title></svelte:head>

<!-- only there with a hidden sidebar, for the way back to it -->
<TitleBar class="-mb-6 hidden md:flex" />
<main class={['page', wide && 'max-w-5xl']}>
	<header class="space-y-1">
		<h1 class="title">{title}</h1>
		{#if description}<div class="text-muted">{@render description()}</div>{/if}
	</header>
	{@render children()}
</main>
