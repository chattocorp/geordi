<script lang="ts">
	let {
		label,
		value,
		href,
		linkLabel
	}: {
		label?: string | null;
		value: string;
		href?: string;
		linkLabel?: string;
	} = $props();
	const title = $derived(label ? `${label} ${value}` : value);
	const pill = 'indicator-pill max-w-full bg-sunken px-2 font-normal text-muted';
</script>

{#snippet content()}
	{#if label}<span class="truncate">{label}</span>{/if}
	<span class="max-w-full shrink-0 truncate font-semibold text-ink tabular-nums">{value}</span>
{/snippet}

{#if href}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- caller supplies a resolved URL -->
	<a {href} {title} aria-label={linkLabel} class={[pill, 'hover:bg-hover']} draggable="false">
		{@render content()}
	</a>
{:else}
	<span {title} class={pill}>{@render content()}</span>
{/if}
