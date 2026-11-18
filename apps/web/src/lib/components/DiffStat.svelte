<script lang="ts">
	/** Lines added and removed; `added` is `null` for a binary file. */
	let { added, removed }: { added: number | null; removed: number | null } = $props();
</script>

<span class="shrink-0 code-dense">
	{#if added === null}
		<span class="text-muted">binary</span>
	{:else}
		{#if added}<span class="text-ok">+{added}</span>{/if}
		{#if removed}<span class="text-danger">−{removed}</span>{/if}
	{/if}
</span>
