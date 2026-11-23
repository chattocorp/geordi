<script lang="ts">
	import type { Agent, ContextUsage, UsageLimit } from '@geordi/protocol';
	import { agentName } from '#lib/format.ts';
	import { describeUsage, fullness } from '#lib/tokens.ts';
	import { charge, leftOf, limitTone, toneOf, type Tone } from '#lib/limits.ts';
	import Tooltip from '#lib/ui/Tooltip.svelte';
	import Battery from '#lib/components/Battery.svelte';
	import { lba } from '#lib/lba.svelte.ts';

	/**
	 * How the agent stands, as a phone would say it: its reception fades as its context fills
	 * up, and its battery is what its usage limits leave of the model it talks to. On hover,
	 * the same, one by one: the context's reception and each limit's battery, with their
	 * numbers in words. Quiet until something runs low (yellow) or nearly out (red).
	 */
	let {
		usage,
		agent,
		limits = [],
		model
	}: {
		/** How full the context is, once the agent has said. */
		usage?: ContextUsage | null;
		agent: Agent;
		limits?: UsageLimit[];
		/** The model that answers next, for the limits that hold for it alone. */
		model?: string;
	} = $props();

	const context = $derived(usage ? 1 - fullness(usage) : undefined);
	const contextTone = $derived(toneOf(context));
	// none in low battery anxiety mode, so that a meter of nothing but a battery is not there
	const battery = $derived(lba.on ? undefined : charge(limits, model));

	const fills: Record<Tone, string> = {
		normal: 'fill-muted',
		warning: 'fill-warning',
		danger: 'fill-danger'
	};
	const texts: Record<Tone, string> = {
		normal: '',
		warning: 'font-medium text-warning',
		danger: 'font-medium text-danger'
	};

	const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
	const day = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		hour: 'numeric',
		minute: '2-digit'
	});
	/** When a limit starts over: the time if that is today-ish, else the day and time. */
	const resets = (at: number) =>
		at - Date.now() < 20 * 60 * 60_000 ? time.format(at) : day.format(at);
	const percent = (left: number) => `${Math.round(left * 100)}% left`;
</script>

{#if usage || battery}<Tooltip>
		<span class="flex h-9 items-center gap-2 px-1.5">
			{#if usage && context !== undefined}
				{@render signal(context, contextTone, `Context: ${describeUsage(usage)}`)}
			{/if}
			{#if battery}
				<Battery
					left={battery.left}
					tone={battery.tone}
					label="{agentName[agent]} usage: {percent(battery.left)}"
				/>
			{/if}
		</span>
		{#snippet tip()}
			<table class="tabular-nums">
				<tbody>
					{#if usage && context !== undefined}
						<tr>
							<!-- the icons centred in a column as wide as the battery, so that they line up -->
							<td class="pr-2">
								<span class="flex w-8 justify-center">{@render signal(context, contextTone)}</span>
							</td>
							<td class="pr-3">Context</td>
							<td class={['pr-3 text-right', texts[contextTone]]}>{percent(context)}</td>
							<td class="text-muted">{describeUsage(usage)}</td>
						</tr>
					{/if}
					{#if usage && limits.length}
						<!-- the limits, set a little apart: their batteries say what they are -->
						<tr aria-hidden="true"><td colspan="4" class="h-1.5"></td></tr>
					{/if}
					{#if limits.length}
						{#each limits as limit (limit.name)}
							{@const left = leftOf(limit)}
							{@const tone = limitTone(limit)}
							<tr>
								<td class="pr-2">
									<span class="flex w-8 justify-center">
										{#if left !== undefined}<Battery {left} {tone} />{/if}
									</span>
								</td>
								<td class="pr-3">{limit.name}</td>
								<td class={['pr-3 text-right', texts[tone]]}>
									{left !== undefined ? percent(left) : tone === 'warning' ? 'running low' : ''}
								</td>
								<td class="text-muted">
									{limit.resetsAt ? `resets ${resets(limit.resetsAt)}` : ''}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		{/snippet}
	</Tooltip>{/if}

<!--
	Drawn like a phone's status bar, beside its `Battery`: what is there in its tone; what is
	gone, faint. Bars and battery share their top and bottom (y 2.5 to 17.5). Without a `label`,
	they only illustrate the words beside them.
-->
{#snippet signal(left: number, tone: Tone, label?: string)}
	<!-- one bar at least, so that a full context still shows its red -->
	{@const bars = Math.max(1, Math.ceil(left * 4))}
	<svg
		viewBox="0 0 20 20"
		class="block size-5"
		role={label ? 'img' : undefined}
		aria-label={label}
		aria-hidden={!label}
	>
		{#each [0, 1, 2, 3] as bar (bar)}
			<rect
				x={1 + bar * 4.75}
				y={11.5 - bar * 3}
				width="3.75"
				height={6 + bar * 3}
				rx="1"
				class={bar < bars ? fills[tone] : 'fill-muted/30'}
			/>
		{/each}
	</svg>
{/snippet}
