<script lang="ts">
	import type { Snippet } from 'svelte';
	import MessageCopy from './MessageCopy.svelte';

	let {
		text,
		children,
		cursor,
		footer
	}: { text: string; children?: Snippet; cursor?: Snippet; footer?: Snippet } = $props();
</script>

<div class="group/part" class:inline-copy={!footer && !!text}>
	{#if children}{@render children()}{:else}<div class="prose">
			<p class="whitespace-pre-wrap">{text}</p>
		</div>{/if}
	{#if cursor}{@render cursor()}{/if}
	{#if footer}
		<div class="mt-3">{@render footer()}</div>
	{:else if text}
		<span
			class="inline-flex align-middle transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/part:opacity-100 pointer-fine:focus-within:opacity-100"
		>
			<MessageCopy {text} />
		</span>
	{/if}
</div>

<style>
	/* Let the button follow the final line of prose. Other Markdown blocks keep their layout. */
	.inline-copy > :global(.prose:has(> p:last-child)),
	.inline-copy > :global(.prose > p:last-child) {
		display: inline;
	}

	.inline-copy > :global(.prose:has(> p:last-child) + span) {
		margin-inline-start: var(--spacing);
	}
</style>
