<script lang="ts">
	import type { Snippet } from 'svelte';

	/** The title link covers the card. A footer action remains independently focusable. */
	let {
		title,
		href,
		external = false,
		header,
		footer
	}: {
		title: string;
		href: string;
		external?: boolean;
		header?: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<article
	class="relative flex h-full min-w-0 flex-col gap-3 card p-4 transition-shadow hover:shadow-card-float"
>
	{#if header}<div class="flex flex-wrap items-center gap-2 text-xs text-muted">
			{@render header()}
		</div>{/if}
	<h2 class="heading break-words">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- the caller supplies the destination -->
		<a
			{href}
			target={external ? '_blank' : undefined}
			rel={external ? 'noreferrer' : undefined}
			class="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent"
		>
			{title}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</h2>
	{#if footer}<div
			class="pointer-events-none relative mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-muted [&_a]:pointer-events-auto [&_button]:pointer-events-auto"
		>
			{@render footer()}
		</div>{/if}
</article>
