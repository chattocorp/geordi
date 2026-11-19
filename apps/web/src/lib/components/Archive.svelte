<script lang="ts">
	import { resolve } from '$app/paths';
	import Page from '#lib/ui/Page.svelte';
	import WaitingForView from './WaitingForView.svelte';
	import type { ArchiveEntry } from '#lib/server/views.ts';

	let { entries, lost = false }: { entries?: ArchiveEntry[]; lost?: boolean } = $props();
	let search = $state('');
	const filtered = $derived(
		entries?.filter(({ title, repository }) =>
			(title + ' ' + repository).toLowerCase().includes(search.trim().toLowerCase())
		)
	);
</script>

<Page title="Archived workspaces">
	{#if !entries}
		<WaitingForView {lost} />
	{:else if !entries.length}
		<p class="empty">No archived workspaces.</p>
	{:else}
		<input
			type="search"
			class="input"
			aria-label="Search archived workspaces"
			placeholder="Search by title or repository"
			bind:value={search}
		/>
		<ul>
			{#each filtered ?? [] as entry (entry.id)}
				<li>
					<a
						class="item justify-between gap-4 px-3 py-2"
						href={resolve('/workspaces/[id]', { id: entry.id })}
					>
						<span class="min-w-0"
							><span class="block truncate font-medium text-ink">{entry.title}</span><span
								class="text-xs text-muted">{entry.repository}</span
							></span
						>
						<time class="shrink-0 text-xs text-muted" datetime={entry.archivedAt}
							>{new Date(entry.archivedAt).toLocaleDateString()}</time
						>
					</a>
				</li>
			{:else}
				<li class="empty">No matching workspaces.</li>
			{/each}
		</ul>
	{/if}
</Page>
