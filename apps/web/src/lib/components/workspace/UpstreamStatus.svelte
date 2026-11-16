<script lang="ts">
	import type { Upstream } from '@geordi/protocol';
	import Badge from '#lib/ui/Badge.svelte';

	/** How a workspace's branch stands on its repository's forge: pushed or not, and its pull request. */
	let { upstream }: { upstream: Upstream } = $props();

	const pull = $derived(upstream.pull);

	const states = { open: 'Open', closed: 'Closed', merged: 'Merged', unknown: 'Unknown' };

	/**
	 * The checks as a bar of how far they are: what failed and what passed on the left, what
	 * is still running on the right. Where the forge only says how they stand overall, the
	 * bar is all of one colour.
	 */
	const checks = $derived.by(() => {
		const checks = pull?.checks;
		if (!checks) return null;
		const { counts, total, failed } = checks;
		const tones = {
			failed: 'bg-danger',
			passed: 'bg-ok',
			skipped: 'bg-line',
			pending: 'bg-accent bar-running'
		};
		const words = { failed: 'failed', passed: 'passed', skipped: 'skipped', pending: 'running' };
		const kinds = ['failed', 'passed', 'skipped', 'pending'] as const;

		if (counts) {
			const parts = kinds
				.filter((kind) => counts[kind] > 0)
				.map((kind) => ({
					tone: tones[kind],
					size: counts[kind],
					text: `${counts[kind]} ${words[kind]}`
				}));
			// what matters first: what is wrong, then what is still to come, then what is done
			const said = (['failed', 'pending', 'passed', 'skipped'] as const)
				.filter((kind) => counts[kind] > 0)
				.map((kind) => `${counts[kind]} ${words[kind]}`);
			return { parts, text: said.join(', ') };
		}

		const whole = (tone: string, text: string) => ({ parts: [{ tone, size: 1, text }], text });
		switch (checks.state) {
			case 'success':
				return whole(tones.passed, total === null ? 'Passed' : `${total} passed`);
			case 'failure':
				return whole(
					tones.failed,
					failed === null || total === null ? 'Failed' : `${failed} of ${total} failed`
				);
			case 'pending':
				return whole(tones.pending, total === null ? 'Running' : `${total} running`);
			default:
				return whole(tones.skipped, 'Unknown');
		}
	});

	const review = $derived(
		pull?.review &&
			{
				approved: { icon: 'icon-[lucide--thumbs-up] text-ok', text: 'Approved' },
				changes_requested: {
					icon: 'icon-[lucide--message-square-warning] text-danger',
					text: 'Changes requested'
				},
				pending: { icon: 'icon-[lucide--eye]', text: 'Review pending' }
			}[pull.review]
	);
</script>

{#snippet fact(icon: string, text: string, href?: string | null)}
	<svelte:element
		this={href ? 'a' : 'span'}
		{href}
		target={href ? '_blank' : undefined}
		rel={href ? 'noreferrer' : undefined}
		class={['flex items-center gap-1.5', href && 'hover:text-ink']}
	>
		<span class={['size-3.5 shrink-0', icon]}></span>
		{text}
	</svelte:element>
{/snippet}

<section class="space-y-1.5 border-b border-line px-3.5 py-2.5 text-sm" aria-label="Pull request">
	{#if pull}
		<div class="flex items-center gap-2">
			<span class="icon-[lucide--git-pull-request] size-4 shrink-0 text-muted"></span>
			<svelte:element
				this={pull.url ? 'a' : 'span'}
				href={pull.url}
				target="_blank"
				rel="noreferrer"
				class={['min-w-0 flex-1 truncate font-medium', pull.url && 'hover:underline']}
				title={pull.title}
			>
				<span class="text-muted">#{pull.number}</span>
				{pull.title}
			</svelte:element>
			<Badge tone={pull.state === 'open' && !pull.draft ? 'accent' : 'neutral'}>
				{pull.draft && pull.state === 'open' ? 'Draft' : states[pull.state]}
			</Badge>
		</div>
		{#if checks}
			<svelte:element
				this={pull.checks?.url ? 'a' : 'div'}
				href={pull.checks?.url}
				target={pull.checks?.url ? '_blank' : undefined}
				rel={pull.checks?.url ? 'noreferrer' : undefined}
				class="group block space-y-1.5 py-1 pl-6"
			>
				<span class="flex items-baseline gap-2 text-xs">
					<span class="font-medium group-hover:underline">Checks</span>
					<span class="min-w-0 truncate text-muted">{checks.text}</span>
				</span>
				<span class="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
					{#each checks.parts as part (part.text)}
						<span class={part.tone} style:flex-grow={part.size} title={part.text}></span>
					{/each}
				</span>
			</svelte:element>
		{/if}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-xs text-muted">
			{#if review}{@render fact(review.icon, review.text)}{/if}
			{#if pull.base}
				<span class="flex min-w-0 items-center gap-1.5">
					<span class="icon-[lucide--arrow-right] size-3.5 shrink-0"></span>
					<span class="truncate code-dense">{pull.base}</span>
				</span>
			{/if}
		</div>
	{:else}
		<div class="flex items-center gap-2 text-muted">
			<span class="icon-[lucide--git-pull-request-draft] size-4 shrink-0"></span>
			{#if !upstream.pushed}
				<span class="min-w-0 flex-1 truncate">Not pushed to {upstream.repo} yet</span>
			{:else}
				<span class="min-w-0 flex-1 truncate">No pull request</span>
				{#if upstream.createUrl}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- a page on the upstream forge -->
					<a
						href={upstream.createUrl}
						target="_blank"
						rel="noreferrer"
						class="shrink-0 font-medium text-ink hover:underline"
					>
						Open one
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
			{/if}
		</div>
	{/if}
</section>
