<script lang="ts">
	import type { WorkspaceStanding } from './actions.ts';
	import ChecksRing from './ChecksRing.svelte';
	import StatusCircle from './StatusCircle.svelte';

	/** How a workspace's work stands, as one icon in its colour: the checks while they run. */
	let { standing }: { standing: WorkspaceStanding } = $props();
</script>

<StatusCircle tone={standing.tone} label={standing.label}>
	{#if standing.checks}
		<ChecksRing counts={standing.checks} />
	{:else}
		<span class={['size-4', standing.icon]}></span>
	{/if}
</StatusCircle>
