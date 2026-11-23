<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Something went wrong, and here is what. */
	let { children }: { children: Snippet } = $props();
</script>

<div role="alert" class="flex items-start gap-2.5 rounded-card tone-danger px-3.5 py-2.5 text-sm">
	<span class="mt-0.5 icon-[lucide--triangle-alert] size-4 shrink-0"></span>
	<div class="min-w-0">{@render children()}</div>
</div>
