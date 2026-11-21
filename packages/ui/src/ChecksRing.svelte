<script lang="ts">
	import type { CheckCounts } from '@geordi/protocol';
	import { describeCounts } from './checks.ts';
	import Ring from './Ring.svelte';

	/** `autoMerge`: the pull request merges once they pass. */
	let { counts, autoMerge = false }: { counts?: CheckCounts; autoMerge?: boolean } = $props();
	const summary = $derived(counts && describeCounts(counts));
	const core = $derived(autoMerge ? ('ok' as const) : undefined);
	const then = $derived(autoMerge ? ' · merges automatically' : '');
</script>

{#if summary}
	<Ring label="Checks: {summary.text}{then}" parts={summary.parts} {core} />
{:else}
	<Ring label="Checks running{then}" parts={[{ size: 1, tone: 'accent' }]} {core} />
{/if}
