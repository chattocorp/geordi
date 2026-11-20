<script lang="ts">
	import type { Snippet } from 'svelte';
	import MessageCopy from './MessageCopy.svelte';

	let { text, children, footer }: { text: string; children?: Snippet; footer?: Snippet } = $props();
</script>

<div class="group/part">
	{#if children}{@render children()}{:else}<div class="prose">
			<p class="whitespace-pre-wrap">{text}</p>
		</div>{/if}
	{#if footer}
		<div class="mt-3">{@render footer()}</div>
	{:else if text}
		<div
			class="mt-1 flex items-center gap-1 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/part:opacity-100 pointer-fine:focus-within:opacity-100"
		>
			<MessageCopy {text} />
		</div>
	{/if}
</div>
