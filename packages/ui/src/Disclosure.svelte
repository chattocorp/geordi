<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		heading,
		children,
		open = $bindable(false),
		class: extra,
		summaryClass,
		collapsedChevron = true
	}: {
		heading: Snippet;
		children: Snippet;
		open?: boolean;
		class?: string;
		summaryClass?: string;
		collapsedChevron?: boolean;
	} = $props();
</script>

<details bind:open class={extra}>
	<summary class={['flex list-none items-center gap-2 rounded-control select-none', summaryClass]}>
		{@render heading()}
		{#if open || collapsedChevron}
			<span
				aria-hidden="true"
				class="ml-auto icon-[lucide--chevron-right] size-4 shrink-0 text-muted transition-transform motion-reduce:transition-none [details[open]>summary>&]:rotate-90"
			></span>
		{/if}
	</summary>
	{@render children()}
</details>
