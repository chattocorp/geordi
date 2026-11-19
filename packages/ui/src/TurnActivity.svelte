<script lang="ts">
	let {
		summary,
		expanded,
		ontoggle
	}: { summary: string; expanded: boolean; ontoggle: () => void } = $props();
</script>

<button
	type="button"
	class="flex h-7 items-center gap-1.5 rounded-control text-xs text-muted hover:text-ink"
	aria-expanded={expanded}
	onclick={ontoggle}
>
	Turn activity <span class="text-muted">{summary}</span>
	<span class={['icon-[lucide--chevron-right] size-3.5', expanded && 'rotate-90']}></span>
</button>
