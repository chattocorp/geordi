<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		heading,
		children,
		open = $bindable(false),
		class: extra,
		summaryClass
	}: {
		heading: Snippet;
		children: Snippet;
		open?: boolean;
		class?: string;
		summaryClass?: string;
	} = $props();
</script>

<details bind:open class={extra}>
	<summary class={['flex list-none items-center gap-2 rounded-control select-none', summaryClass]}>
		{@render heading()}
		<span
			aria-hidden="true"
			class={[
				'ml-auto icon-[lucide--chevron-right] size-4 shrink-0 text-muted transition-transform motion-reduce:transition-none',
				open && 'rotate-90'
			]}
		></span>
	</summary>
	{@render children()}
</details>
