<script lang="ts">
	import LinkCard from '@geordi/ui/LinkCard.svelte';
	import Badge from '@geordi/ui/Badge.svelte';
	import { timeAgo } from '#lib/format.ts';
	import { resolve } from '$app/paths';
	import type { RepositoryThread } from '@geordi/protocol';
	import type { Navigation } from '#lib/server/views.ts';
	let {
		repo,
		issues,
		items,
		workspaces,
		more = false
	}: {
		repo: string;
		issues: boolean;
		items: RepositoryThread[];
		workspaces: Pick<Navigation['workspaces'][number], 'id' | 'repoId' | 'pull'>[];
		more?: boolean;
	} = $props();
	const review = {
		approved: 'Approved',
		changes_requested: 'Changes requested',
		pending: 'Awaiting review'
	};
</script>

{#if items.length}
	<div class="@container">
		<ul class="grid gap-3 @2xl:grid-cols-2">
			{#each items as item (item.number)}
				{@const workspace =
					!issues &&
					workspaces.find(
						(w) =>
							w.repoId === repo &&
							w.pull?.number === item.number &&
							(!w.pull.url || w.pull.url === item.url)
					)}
				{@const actionHref = issues
					? resolve('/') + '?' + new URLSearchParams({ repo, issue: item.url, title: item.title })
					: workspace
						? resolve('/workspaces/[id]', { id: workspace.id })
						: undefined}
				<li class="min-w-0">
					<LinkCard href={item.url} title={item.title} external>
						{#snippet header()}
							<span
								class={[
									'size-4 shrink-0',
									issues
										? 'icon-[lucide--circle-dot] text-ok'
										: item.draft
											? 'icon-[lucide--git-pull-request-draft]'
											: 'icon-[lucide--git-pull-request] text-ok'
								]}
							></span>
							<span class="font-medium tabular-nums">#{item.number}</span>
							{#if !issues}<Badge
									>{item.draft ? 'Draft' : item.review ? review[item.review] : 'Open'}</Badge
								>{/if}
							{#if item.updatedAt}<time
									class="ml-auto"
									datetime={item.updatedAt}
									title={`Updated ${new Date(item.updatedAt).toLocaleString()}`}
									>{timeAgo(item.updatedAt)}</time
								>{/if}
						{/snippet}
						{#snippet footer()}
							{#if item.author}<span class="min-w-0 flex-1 truncate" title={item.author}
									>@{item.author}</span
								>{/if}
							{#if actionHref}
								<!-- eslint-disable svelte/no-navigation-without-resolve -- both workspace routes are resolved above -->
								<a
									href={actionHref}
									class="ml-auto inline-flex items-center gap-1.5 rounded-control bg-sunken px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-hover"
								>
									<span
										class={[
											issues ? 'icon-[lucide--plus]' : 'icon-[lucide--panels-top-left]',
											'size-3.5'
										]}
									></span>{issues ? 'Start workspace' : 'Open workspace'}
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{/if}
						{/snippet}
					</LinkCard>
				</li>
			{/each}
		</ul>
	</div>
{:else}<p class="empty">
		{more
			? 'No matching items on this page.'
			: issues
				? 'No open issues.'
				: 'No open pull requests.'}
	</p>{/if}
