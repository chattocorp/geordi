<script lang="ts">
	import type { CheckCounts } from '@geordi/protocol';
	import { describeCounts } from '#lib/checks.ts';
	import Ring from '#lib/ui/Ring.svelte';

	let { counts }: { counts?: CheckCounts } = $props();
	const summary = $derived(counts && describeCounts(counts));
</script>

{#if summary}
	<Ring label="Checks: {summary.text}" parts={summary.parts} />
{:else}
	<Ring label="Checks running" parts={[{ size: 1, tone: 'accent' }]} />
{/if}
