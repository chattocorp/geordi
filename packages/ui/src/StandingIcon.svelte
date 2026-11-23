<script lang="ts">
	import type { WorkspaceStanding } from './actions.ts';
	import ChecksRing from './ChecksRing.svelte';
	import StatusIcon from './StatusIcon.svelte';

	/** How a workspace's work stands, as one icon in its colour: the checks while they run. */
	let { standing }: { standing: WorkspaceStanding } = $props();
</script>

<StatusIcon tone={standing.tone} label={standing.label}>
	{#if standing.checks}
		<ChecksRing counts={standing.checks} autoMerge={standing.autoMerge} />
	{:else}
		<span class={['size-4', standing.icon]}></span>
	{/if}
</StatusIcon>
