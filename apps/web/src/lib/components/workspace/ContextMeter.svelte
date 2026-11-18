<script lang="ts">
	import type { ContextUsage } from '@geordi/protocol';
	import { describeUsage, fullness, NEARLY_FULL } from '#lib/tokens.ts';
	import Ring from '#lib/ui/Ring.svelte';

	/**
	 * How full the agent's context is: a quiet ring beside the model it talks to, its numbers
	 * in words on hover. Only a context that is nearly full stands out.
	 */
	let { usage }: { usage: ContextUsage } = $props();

	const share = $derived(fullness(usage));
	const nearlyFull = $derived(share >= NEARLY_FULL);
	const label = $derived(`Context: ${describeUsage(usage)}`);
</script>

<!-- the share beside the ring: without it, a ring that has barely begun looks like it loads -->
<span class="flex h-9 items-center gap-1.5 px-1.5 text-xs text-muted tabular-nums" title={label}>
	<Ring
		{label}
		parts={[
			{ size: share, tone: nearlyFull ? 'danger' : 'muted' },
			{ size: 1 - share, tone: 'empty' }
		]}
	/>
	<span aria-hidden="true" class={{ 'text-danger': nearlyFull }}>{Math.round(share * 100)}%</span>
</span>
