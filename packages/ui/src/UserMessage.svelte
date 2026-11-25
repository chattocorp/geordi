<script lang="ts">
	import type { Snippet } from 'svelte';
	import MessageCopy from './MessageCopy.svelte';
	let { text, children }: { text: string; children?: Snippet } = $props();
</script>

<div class="group/message">
	<div class="ml-auto message bg-bubble">
		{#if children}{@render children()}{:else}<p class="whitespace-pre-wrap">{text}</p>{/if}
	</div>
	{#if text}<div
			class="mt-1 flex items-center justify-end gap-1 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/message:opacity-100 pointer-fine:focus-within:opacity-100"
		>
			<MessageCopy {text} />
		</div>{/if}
</div>
