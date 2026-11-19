<script lang="ts">
	import type { WorkspaceStanding } from '@geordi/ui/actions';
	import ChecksRing from './ChecksRing.svelte';

	/** How a workspace's work stands, as one icon in its colour: the checks while they run. */
	let { standing }: { standing: WorkspaceStanding } = $props();

	/** The colour of how a workspace stands: what is fine, wrong, to do, done. */
	const tones = {
		ok: 'text-ok',
		danger: 'text-danger',
		accent: '',
		merged: 'text-merged',
		neutral: 'text-muted'
	};
</script>

<span class={['grid place-items-center', tones[standing.tone]]} title={standing.label}>
	{#if standing.checks}
		<ChecksRing counts={standing.checks} />
	{:else}
		<span class={['size-4', standing.icon]} role="img" aria-label={standing.label}></span>
	{/if}
</span>
