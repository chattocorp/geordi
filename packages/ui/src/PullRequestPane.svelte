<script lang="ts">
	import type { PullRequest } from '@geordi/protocol';
	import PullChecks from './PullChecks.svelte';
	import Badge from './Badge.svelte';
	import type { Snippet } from 'svelte';

	let { pull, description }: { pull: PullRequest; description?: Snippet<[string]> } = $props();

	const states = { open: 'Open', closed: 'Closed', merged: 'Merged', unknown: 'Unknown' };

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
				<span class="flex items-center gap-1.5">
					<span class={['size-3.5', review.icon]}></span>{review.text}
				</span>
			{/if}
			{#if pull.base}
				<span class="flex min-w-0 items-center gap-1.5">
					<span>into</span>
					<span class="truncate code-dense" title={pull.base}>{pull.base}</span>
				</span>
			{/if}
		</div>
	</header>
	{#if pull.checks}
		{#key pull.number}<PullChecks checks={pull.checks} />{/key}
	{/if}
	{#if pull.body?.trim()}
		<div class="wrap-anywhere">
			{#if description}{@render description(pull.body)}{:else}<p class="whitespace-pre-wrap">
					{pull.body}
				</p>{/if}
		</div>
	{/if}
</section>
