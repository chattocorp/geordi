<script lang="ts">
	import type { Agent, ContextUsage, UsageLimit } from '@geordi/protocol';
	import { agentName } from '#lib/format.ts';
	import { describeUsage, fullness, NEARLY_FULL } from '#lib/tokens.ts';
	import Ring from '#lib/ui/Ring.svelte';
	import Tooltip from '#lib/ui/Tooltip.svelte';

	/**
	 * How full the agent's context is: a quiet ring beside the model it talks to. On hover,
	 * its numbers in words, and how much of its subscription's usage limits is used. Only a
	 * context that is nearly full stands out.
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
		<p>{label}</p>
		{#if limits.length}
			<p class="mt-1.5 text-muted">{agentName[agent]} usage limits</p>
			<table class="tabular-nums">
				<tbody>
					{#each limits as limit (limit.name)}
						{@const left = remaining(limit)}
						<tr>
							<td class="pr-3">{limit.name}</td>
							<!-- what is left of it, as a bar: the fuller, the more there is -->
							<td class="pr-2">
								{#if left !== undefined}
									<span class="block h-1.5 w-20 overflow-hidden rounded-full bg-sunken">
										<span
											class={[
												'block h-full rounded-full',
												limit.status === 'ok' ? 'bg-muted' : 'bg-danger'
											]}
											style:width="{left}%"
										></span>
									</span>
								{/if}
							</td>
							<td class={['pr-3 text-right', limit.status !== 'ok' && 'font-medium text-danger']}>
								{left === undefined ? '' : `${left}% left`}
							</td>
							<td class="text-muted">
								{limit.resetsAt ? `resets ${resets(limit.resetsAt)}` : ''}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/snippet}
</Tooltip>
