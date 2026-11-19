<script lang="ts">
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
	<ul class="space-y-1">
		{#each items as item (item.number)}
			{@const workspace =
				!issues &&
				workspaces.find(
					(w) =>
						w.repoId === repo &&
						w.pull?.number === item.number &&
						(!w.pull.url || w.pull.url === item.url)
				)}
			<li
				class="flex flex-wrap items-center justify-between gap-2 rounded-control px-3 py-2 hover:bg-hover"
			>
				<div class="min-w-0 flex-1">
					<!-- eslint-disable svelte/no-navigation-without-resolve -- upstream link -->
					<a
						href={item.url}
						target="_blank"
						rel="noreferrer"
						class="font-medium break-words hover:underline">{item.title}</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<p class="text-xs text-muted">
						#{item.number}{#if !issues}
							&nbsp;· {item.draft ? 'Draft' : item.review ? review[item.review] : 'Open'}{/if}
					</p>
				</div>
				{#if issues}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved route with issue parameters -->
					<a
						class="item px-2 py-1 text-sm"
						href={resolve('/') +
							'?' +
							new URLSearchParams({ repo, issue: item.url, title: item.title })}>Start workspace</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else if workspace}<a
						class="item px-2 py-1 text-sm"
						href={resolve('/workspaces/[id]', { id: workspace.id })}>Open workspace</a
					>{/if}
			</li>
		{/each}
	</ul>
{:else}<p class="empty">
		{more
			? 'No matching items on this page.'
			: issues
				? 'No open issues.'
				: 'No open pull requests.'}
	</p>{/if}
