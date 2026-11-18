<script lang="ts">
	import Disclosure from '#lib/ui/Disclosure.svelte';
	import type { PullCheck, PullRequest } from '@geordi/protocol';
	import { describeChecks } from '#lib/checks.ts';

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
		pending: { label: 'Running', icon: 'icon-[lucide--circle-dot] text-accent-ink', order: 1 },
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
	const statusText = $derived.by(() => {
		if (!sorted.length) return summary.text;
		const groups = Object.groupBy(sorted, (check) => label(check).toLowerCase());
		return Object.entries(groups)
			.map(([status, checks]) => `${checks!.length} ${status}`)
			.join(', ');
	});
	const active = $derived(sorted.filter((c) => c.state === 'failure' || c.state === 'pending'));
	const remaining = $derived(sorted.filter((c) => c.state !== 'failure' && c.state !== 'pending'));
	let expanded = $state<boolean>();
	const show = $derived(expanded ?? active.length > 0);
</script>

{#snippet rows(items: PullCheck[])}
	<ul>
		{#each items as check (check.id)}
			<li>
				<svelte:element
					this={check.url ? 'a' : 'div'}
					href={check.url}
					target={check.url ? '_blank' : undefined}
					rel={check.url ? 'noreferrer' : undefined}
					class={[
						'group/row flex items-center gap-2 rounded-control px-2 py-1.5',
						check.url && 'hover:bg-sunken'
					]}
				>
					<span aria-hidden="true" class={['size-4 shrink-0', states[check.state].icon]}></span>
					<span
						class={[
							'min-w-0 flex-1 text-sm wrap-anywhere',
							check.url && 'group-hover/row:underline'
						]}>{check.name}</span
					>
					<span class="text-xs text-muted">{label(check)}</span>
				</svelte:element>
			</li>
		{/each}
	</ul>
{/snippet}

<section aria-label="Checks" class="space-y-1 rounded-card bg-surface p-2">
	<div class="flex items-center gap-1">
		{#if sorted.length}
			<button
				type="button"
				aria-expanded={show}
				onclick={() => (expanded = !show)}
				class="flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1 text-left hover:bg-sunken"
			>
				<span
					aria-hidden="true"
					class={['icon-[lucide--chevron-right] size-4 shrink-0 text-muted', show && 'rotate-90']}
				></span>
				<span class="text-sm font-medium">Checks</span>
				<span class="text-xs text-muted">{sorted.length}</span>
			</button>
		{:else}
			<span class="flex-1 px-2 py-1 text-sm font-medium">Checks</span>
		{/if}
		{#if checks.url}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- upstream forge URL -->
			<a
				href={checks.url}
				target="_blank"
				rel="noreferrer"
				aria-label="Open checks on forge"
				title="Open checks on forge"
				class="flex rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
				><span class="icon-[lucide--external-link] size-4"></span></a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	</div>
	<div class="px-2 pb-1" title={statusText}>
		<div
			role="img"
			aria-label={statusText || 'No checks'}
			class="flex h-1 gap-0.5 overflow-hidden rounded-full"
		>
			{#each summary.parts as part (part.tone)}<span
					class={bar[part.tone]}
					style:flex-grow={part.size}
				></span>{/each}
		</div>
	</div>
	{#if show && sorted.length}
		{#if active.length}
			{@render rows(active)}
			{#if remaining.length}
				<Disclosure summaryClass="px-2 py-1.5 text-xs text-muted hover:bg-sunken">
					{#snippet heading()}Other checks ({remaining.length}){/snippet}
					{@render rows(remaining)}
				</Disclosure>
			{/if}
		{:else}
			{@render rows(sorted)}
		{/if}
	{/if}
</section>
