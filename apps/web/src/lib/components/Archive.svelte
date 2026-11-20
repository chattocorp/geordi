<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '@geordi/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Page from '#lib/ui/Page.svelte';
	import { contextMenu } from '#lib/ui/menu.svelte.ts';
	import { problemOf } from '#lib/problem.ts';
	import WaitingForView from './WaitingForView.svelte';
	import type { ArchiveEntry } from '#lib/server/views.ts';

	type Props = {
		entries?: ArchiveEntry[];
		lost?: boolean;
		/** Deletes these workspaces for good; says how many went and how many bytes smaller the log got. */
		onpurge?: (ids: string[]) => Promise<{ purged: number; freed: number }>;
	};
	let { entries, lost = false, onpurge }: Props = $props();
	let search = $state('');
	const filtered = $derived(
		entries?.filter(({ title, repository }) =>
			(title + ' ' + repository).toLowerCase().includes(search.trim().toLowerCase())
		)
	);

	/** What is about to be deleted, once the person says so. */
	let asking = $state<{ ids: string[]; heading: string } | null>(null);
	let busy = $state(false);
	let problem = $state<string | null>(null);
	/** What the last deletion did. */
	let outcome = $state<string | null>(null);

	function ask(chosen: ArchiveEntry[]) {
		problem = null;
		asking = {
			ids: chosen.map((entry) => entry.id),
			heading:
				chosen.length === 1
					? `Delete “${chosen[0].title}” permanently?`
					: `Delete ${chosen.length} archived workspaces permanently?`
		};
	}

	const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

	async function purge() {
		if (!asking || !onpurge) return;
		busy = true;
		try {
			const { purged, freed } = await onpurge(asking.ids);
			const deleted = `Deleted ${purged === 1 ? 'one workspace' : `${purged} workspaces`}`;
			// what is too little to name is not worth a number
			outcome =
				freed >= 100_000
					? `${deleted}. Geordi's log is ${megabytes(freed)} smaller.`
					: `${deleted}.`;
			asking = null;
		} catch (error) {
			problem = problemOf(error, 'Could not delete them.');
		} finally {
			busy = false;
		}
	}
</script>

<Page title="Archived workspaces">
	{#if !entries}
		<WaitingForView {lost} />
	{:else if !entries.length}
		<p class="empty">No archived workspaces.</p>
		{#if outcome}<p class="text-sm text-muted">{outcome}</p>{/if}
	{:else}
		<div class="flex items-center gap-2">
			<input
				type="search"
				class="flex-1 input"
				aria-label="Search archived workspaces"
				placeholder="Search by title or repository"
				bind:value={search}
			/>
			{#if onpurge && filtered?.length}
				<Button variant="soft" onclick={() => ask(filtered ?? [])}>
					{search.trim() ? `Delete ${filtered.length}` : 'Delete all'}
				</Button>
			{/if}
		</div>
		{#if outcome}<p class="text-sm text-muted">{outcome}</p>{/if}
		<ul>
			{#each filtered ?? [] as entry (entry.id)}
				<li>
					<a
						class="item justify-between gap-4 px-3 py-2"
						href={resolve('/workspaces/[id]', { id: entry.id })}
						{@attach contextMenu(() =>
							onpurge
								? [
										{
											label: 'Delete permanently…',
											icon: 'icon-[lucide--trash-2]',
											tone: 'danger',
											onselect: () => ask([entry])
										}
									]
								: []
						)}
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

<Dialog
	bind:open={() => asking !== null, (open) => !open && !busy && (asking = null)}
	label={asking?.heading ?? ''}
	class="max-w-lg"
>
	<div class="flex flex-col gap-4 p-6">
		<p class="heading wrap-anywhere">{asking?.heading}</p>
		<p class="text-sm">
			{asking?.ids.length === 1
				? 'Its conversation, and those of the agents it started, are'
				: 'Their conversations, and those of the agents they started, are'} deleted from Geordi for good.
			This can't be undone. Git branches are kept.
		</p>
		{#if problem}<p class="text-sm text-danger" role="alert">{problem}</p>{/if}
		<div class="dialog-actions">
			<Button variant="soft" disabled={busy} onclick={() => (asking = null)}>Cancel</Button>
			<Button variant="primary" {busy} onclick={purge}>Delete</Button>
		</div>
	</div>
</Dialog>
