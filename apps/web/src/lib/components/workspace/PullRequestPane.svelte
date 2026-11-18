<script lang="ts">
	import type { PullRequest } from '@geordi/protocol';
	import { describeChecks } from '#lib/checks.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Markdown from '#lib/components/Markdown.svelte';

	let { pull }: { pull: PullRequest } = $props();

	const states = { open: 'Open', closed: 'Closed', merged: 'Merged', unknown: 'Unknown' };

	const checks = $derived(pull.checks && describeChecks(pull.checks));
	const bar = {
		danger: 'bg-danger',
		ok: 'bg-ok',
		neutral: 'bg-line',
		accent: 'bg-accent bar-running'
	};

	const review = $derived(
		pull.review &&
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

<section class="scroller space-y-4 p-4 text-sm" aria-label="Pull request">
	<header class="space-y-2">
		<h2 class="text-base heading wrap-anywhere">
			<svelte:element
				this={pull.url ? 'a' : 'span'}
				href={pull.url}
				target="_blank"
				rel="noreferrer"
				class={pull.url && 'hover:underline'}
			>
				{pull.title}
			</svelte:element>
		</h2>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
			<Badge tone={pull.state === 'open' && !pull.draft ? 'accent' : 'neutral'}>
				{pull.draft && pull.state === 'open' ? 'Draft' : states[pull.state]}
			</Badge>
			{#if review}
				<span class="flex items-center gap-1.5"
					><span class={['size-3.5', review.icon]}></span>{review.text}</span
				>
			{/if}
			{#if pull.base}
				<span class="flex min-w-0 items-center gap-1.5">
					<span>into</span>
					<span class="truncate code-dense" title={pull.base}>{pull.base}</span>
				</span>
			{/if}
		</div>
	</header>
	{#if checks}
		<svelte:element
			this={pull.checks?.url ? 'a' : 'div'}
			href={pull.checks?.url}
			target={pull.checks?.url ? '_blank' : undefined}
			rel={pull.checks?.url ? 'noreferrer' : undefined}
			class={['block space-y-1.5', pull.checks?.url && 'group']}
		>
			<span class="flex items-baseline gap-2 text-xs">
				<span class="font-medium group-hover:underline">Checks</span>
				<span class="text-muted">{checks.text}</span>
			</span>
			<span class="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
				{#each checks.parts as part (part.tone)}
					<span class={bar[part.tone]} style:flex-grow={part.size}></span>
				{/each}
			</span>
		</svelte:element>
	{/if}
	{#if pull.checks?.running?.length}
		<details open class="text-xs">
			<summary class="font-medium">Running checks</summary>
			<ul class="mt-1.5 space-y-1 pl-4">
				{#each pull.checks.running as check (check)}
					<li class="wrap-anywhere">
						{#if check.url}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- external check URL from the forge -->
							<a href={check.url} target="_blank" rel="noreferrer" class="hover:underline"
								>{check.name}</a
							>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{:else}
							{check.name}
						{/if}
					</li>
				{/each}
			</ul>
		</details>
	{/if}
	{#if pull.body?.trim()}
		<div class="wrap-anywhere"><Markdown text={pull.body} /></div>
	{/if}
</section>
