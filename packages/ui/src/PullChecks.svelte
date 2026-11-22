<script lang="ts">
	import type { PullCheck, PullRequest } from '@geordi/protocol';
	import { persisted } from './persisted.svelte.ts';
	import { duration } from './duration.ts';
	import { describeChecks } from './checks.ts';

	let { checks }: { checks: NonNullable<PullRequest['checks']> } = $props();
	const summary = $derived(describeChecks(checks));
	const bar = {
		danger: 'bg-danger',
		ok: 'bg-ok',
		neutral: 'bg-line',
		accent: 'bg-accent bar-running'
	};
	const states = {
		failure: { label: 'Failed', icon: 'icon-[lucide--circle-x] text-danger', order: 0 },
		pending: {
			label: 'Running',
			icon: 'icon-[lucide--circle-dot] text-accent-ink motion-safe:animate-pulse',
			order: 1
		},
		success: { label: 'Passed', icon: 'icon-[lucide--circle-check] text-ok', order: 2 },
		neutral: { label: 'Neutral', icon: 'icon-[lucide--circle-minus] text-muted', order: 3 },
		unknown: { label: 'Unknown', icon: 'icon-[lucide--circle-help] text-muted', order: 4 }
	};
	const labels: Record<string, string> = {
		queued: 'Queued',
		waiting: 'Waiting',
		pending: 'Pending',
		requested: 'Requested',
		skipped: 'Skipped',
		cancelled: 'Cancelled',
		canceled: 'Cancelled',
		timed_out: 'Timed out',
		action_required: 'Action required'
	};
	const sorted = $derived(
		checks.items?.toSorted(
			(a, b) => states[a.state].order - states[b.state].order || a.name.localeCompare(b.name)
		) ?? []
	);
	function label(check: PullCheck) {
		return Object.hasOwn(labels, check.status) ? labels[check.status] : states[check.state].label;
	}
	function timed(check: PullCheck): check is PullCheck & { startedAt: number } {
		return (
			check.state === 'pending' && label(check) === 'Running' && Number.isFinite(check.startedAt)
		);
	}
	let now = $state(Date.now());
	function tick() {
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	}
	const ticking = $derived(sorted.some(timed));
	const statusText = $derived.by(() => {
		if (!sorted.length) return summary.text;
		const groups = Object.groupBy(sorted, (check) => label(check).toLowerCase());
		return Object.entries(groups)
			.map(([status, checks]) => `${checks!.length} ${status}`)
			.join(', ');
	});
	const expanded = persisted('geordi:checks-expanded', false);
</script>

{#snippet checksSummary()}
	<span class={['flex items-center gap-2 px-2 py-1', checks.url && 'mr-8']}>
		{#if sorted.length}
			<span
				aria-hidden="true"
				class={[
					'icon-[lucide--chevron-right] size-4 shrink-0 text-muted',
					expanded.current && 'rotate-90'
				]}
			></span>
		{/if}
		<span class="text-sm font-medium">Checks</span>
		{#if sorted.length}<span class="text-xs text-muted">{sorted.length}</span>{/if}
	</span>
	<span class="block px-2 pb-1" title={statusText}>
		<span
			role="img"
			aria-label={statusText || 'No checks'}
			class="flex h-2 gap-0.5 overflow-hidden rounded-full"
		>
			{#each summary.parts as part (part.tone)}<span
					class={[
						'transition-all duration-500 ease-out motion-reduce:transition-none',
						bar[part.tone]
					]}
					style:flex-grow={part.size}
				></span>{/each}
		</span>
	</span>
{/snippet}

<section aria-label="Checks" class="rounded-card bg-surface">
	<div class="relative">
		{#if sorted.length}
			<button
				type="button"
				aria-expanded={expanded.current}
				onclick={() => (expanded.current = !expanded.current)}
				class="block w-full space-y-1 rounded-card p-2 text-left hover:bg-hover"
			>
				{@render checksSummary()}
			</button>
		{:else}
			<div class="space-y-1 p-2">{@render checksSummary()}</div>
		{/if}
		{#if checks.url}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- upstream forge URL -->
			<a
				href={checks.url}
				target="_blank"
				rel="noreferrer"
				aria-label="Open checks on forge"
				title="Open checks on forge"
				class="absolute top-2 right-2 flex rounded-control p-1.5 text-muted hover:bg-hover hover:text-ink"
			>
				<span class="icon-[lucide--external-link] size-4"></span>
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	</div>
	{#if expanded.current && sorted.length}
		<ul class="max-h-80 overflow-y-auto px-2 pb-2" {@attach ticking ? tick : undefined}>
			{#each sorted as check (check.id)}
				<li>
					<svelte:element
						this={check.url ? 'a' : 'div'}
						href={check.url}
						target={check.url ? '_blank' : undefined}
						rel={check.url ? 'noreferrer' : undefined}
						class={[
							'group/row flex items-center gap-2 rounded-control px-2 py-1.5',
							// one that leads somewhere is a row like any other list's
							check.url && 'item text-ink'
						]}
					>
						<span aria-hidden="true" class={['size-4 shrink-0', states[check.state].icon]}></span>
						<span
							class={[
								'min-w-0 flex-1 text-sm wrap-anywhere',
								check.url && 'group-hover/row:underline'
							]}
						>
							{check.name}
						</span>
						<span class="shrink-0 text-xs whitespace-nowrap text-muted tabular-nums">
							<span class:sr-only={label(check) === 'Running'}>{label(check)}</span>
							{#if timed(check)}{duration(now - check.startedAt)}{/if}
						</span>
					</svelte:element>
				</li>
			{/each}
		</ul>
	{/if}
</section>
