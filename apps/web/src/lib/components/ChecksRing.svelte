<script lang="ts">
	import type { PullRequest } from '@geordi/protocol';
	import Ring from '#lib/ui/Ring.svelte';

	let { counts }: { counts?: NonNullable<PullRequest['checks']>['counts'] } = $props();
</script>

{#if counts}
	<Ring
		label="Checks: {counts.pending} running, {counts.passed} passed{counts.failed
			? `, ${counts.failed} failed`
			: ''}"
		parts={[
			{ size: counts.failed, tone: 'danger' },
			{ size: counts.passed, tone: 'ok' },
			{ size: counts.skipped, tone: 'neutral' },
			{ size: counts.pending, tone: 'accent' }
		]}
	/>
{:else}
	<Ring label="Checks running" parts={[{ size: 1, tone: 'accent' }]} />
{/if}
