<script lang="ts">
	import Badge from '#lib/ui/Badge.svelte';
	import Spinner from '@geordi/ui/Spinner.svelte';

	/** Whether an agent (or anything in a workspace) is working right now. */
	let { running }: { running: boolean } = $props();
</script>

{#if running}
	<Badge tone="accent"><Spinner /> Working</Badge>
{:else}
	<Badge dot>Idle</Badge>
{/if}
