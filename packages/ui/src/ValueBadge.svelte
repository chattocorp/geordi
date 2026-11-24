<script lang="ts">
	let { label, value }: { label?: string | null; value: string } = $props();
</script>

<span
	class="indicator-pill max-w-full bg-sunken px-2 font-normal text-muted"
	title={label ? `${label} ${value}` : value}
>
	{#if label}<span class="truncate">{label}</span>{/if}
	<span class="max-w-full shrink-0 truncate font-semibold text-ink tabular-nums">{value}</span>
</span>
