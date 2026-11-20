<script lang="ts">
	/** Lines added and removed; `added` is `null` for a binary file. */
	let {
		added,
		removed,
		class: className = 'code-dense'
	}: { added: number | null; removed: number | null; class?: string } = $props();
</script>

<span class={['shrink-0', className]}>
	{#if added === null}
		<span class="text-muted">binary</span>
	{:else}
		{#if added}<span class="text-ok">+{added}</span>{/if}
		{#if removed}<span class="text-danger">−{removed}</span>{/if}
	{/if}
</span>
