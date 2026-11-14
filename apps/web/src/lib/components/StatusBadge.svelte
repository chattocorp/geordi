<script lang="ts">
	let { running }: { running: boolean } = $props();
</script>

{#if running}
	<span
		class="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink"
	>
		<span class="size-1.5 rounded-full bg-accent"></span>
		Working
	</span>
{:else}
	<span
		class="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted"
	>
		<span class="size-1.5 rounded-full bg-muted/50"></span>
		Idle
	</span>
{/if}
