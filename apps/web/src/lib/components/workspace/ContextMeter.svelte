<script lang="ts">
	import type { Agent, ContextUsage, UsageLimit } from '@geordi/protocol';
	import { agentName } from '#lib/format.ts';
	import { describeUsage, fullness, NEARLY_FULL } from '#lib/tokens.ts';
	import Ring from '@geordi/ui/Ring.svelte';
	import Tooltip from '#lib/ui/Tooltip.svelte';

	/**
	 * How full the agent's context is: a quiet ring beside the model it talks to. On hover,
	 * what is left of it and of its subscription's usage limits, each as a bar with its
	 * numbers in words. Only what is nearly used up stands out.
	 */
	let {
		usage,
		agent,
		limits = []
	}: { usage: ContextUsage; agent: Agent; limits?: UsageLimit[] } = $props();

	const share = $derived(fullness(usage));
	const nearlyFull = $derived(share >= NEARLY_FULL);
	const label = $derived(`Context: ${describeUsage(usage)}`);

	const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
	const day = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		hour: 'numeric',
		minute: '2-digit'
	});
	/** How much of a limit is left, in whole percent, where its provider says how much is used. */
	const remaining = ({ usedPercent }: UsageLimit) =>
		usedPercent === undefined ? undefined : Math.max(0, Math.round(100 - usedPercent));
	/** When a limit starts over: the time if that is today-ish, else the day and time. */
	const resets = (at: number) =>
		at - Date.now() < 20 * 60 * 60_000 ? time.format(at) : day.format(at);
</script>

<Tooltip>
	<!-- the share beside the ring: without it, a ring that has barely begun looks like it loads -->
	<span class="flex h-9 items-center gap-1.5 px-1.5 text-xs text-muted tabular-nums">
		<Ring
			{label}
			parts={[
				{ size: share, tone: nearlyFull ? 'danger' : 'muted' },
				{ size: 1 - share, tone: 'empty' }
			]}
		/>
		<span aria-hidden="true" class={{ 'text-danger': nearlyFull }}>{Math.round(share * 100)}%</span>
	</span>
	{#snippet tip()}
		<!-- the context and each limit alike: what is left of it, as a bar and in words -->
		<table class="tabular-nums">
			<tbody>
				{@render row('Context', Math.round((1 - share) * 100), nearlyFull, describeUsage(usage))}
				{#if limits.length}
					<tr><td colspan="4" class="pt-1.5 text-muted">{agentName[agent]} usage limits</td></tr>
					{#each limits as limit (limit.name)}
						{@render row(
							limit.name,
							remaining(limit),
							limit.status !== 'ok',
							limit.resetsAt ? `resets ${resets(limit.resetsAt)}` : ''
						)}
					{/each}
				{/if}
			</tbody>
		</table>
	{/snippet}
</Tooltip>

<!-- `low`: what is left is little enough to stand out -->
{#snippet row(name: string, left: number | undefined, low: boolean, detail: string)}
	<tr>
		<td class="pr-3">{name}</td>
		<td class="pr-2">
			{#if left !== undefined}
				<span class="block h-1.5 w-20 overflow-hidden rounded-full bg-sunken">
					<span
						class={['block h-full rounded-full', low ? 'bg-danger' : 'bg-muted']}
						style:width="{left}%"
					></span>
				</span>
			{/if}
		</td>
		<td class={['pr-3 text-right', low && 'font-medium text-danger']}>
			{left === undefined ? '' : `${left}% left`}
		</td>
		<td class="text-muted">{detail}</td>
	</tr>
{/snippet}
