<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Page from '#lib/ui/Page.svelte';
	import { contextMenu, type MenuItem } from '#lib/ui/menu.svelte.ts';
	import { problemOf } from '#lib/problem.ts';
	import RepoIcon from './RepoIcon.svelte';
	import WaitingForView from './WaitingForView.svelte';
	import type { ArchiveEntry } from '#lib/server/views.ts';

	type Props = {
		entries?: ArchiveEntry[];
		lost?: boolean;
		onrestore?: (id: string) => Promise<void>;
		/** Deletes these workspaces for good; says how many went and how many bytes smaller the log got. */
		onpurge?: (ids: string[]) => Promise<{ purged: number; freed: number }>;
	};
	let { entries, lost = false, onrestore, onpurge }: Props = $props();
	let search = $state('');
	const filtered = $derived(
		entries?.filter(({ title, repository }) =>
			(title + ' ' + repository).toLowerCase().includes(search.trim().toLowerCase())
		)
	);

	const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });
	const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
	const days = $derived(
		Map.groupBy(filtered ?? [], (entry) => day.format(new Date(entry.archivedAt)))
	);

	/** What is about to be deleted, once the person says so. */
	let asking = $state<{ ids: string[]; heading: string } | null>(null);
	let busy = $state(false);
	let problem = $state<string | null>(null);
	/** What the last deletion did. */
	let outcome = $state<string | null>(null);

	/** What is about to be restored, once the person says so. */
	let restoring = $state<ArchiveEntry | null>(null);

	function askToRestore(entry: ArchiveEntry) {
		problem = null;
		restoring = entry;
	}

	async function restore() {
		if (!restoring || !onrestore) return;
		busy = true;
		try {
			await onrestore(restoring.id);
			restoring = null;
		} catch (error) {
			problem = problemOf(error, 'Could not restore the workspace');
		} finally {
			busy = false;
		}
	}

	function menu(entry: ArchiveEntry): MenuItem[] {
		const items: MenuItem[] = [];
		if (onrestore)
			items.push({
				label: 'Restore workspace…',
				icon: 'icon-[lucide--archive-restore]',
				onselect: () => askToRestore(entry)
			});
		if (onpurge)
			items.push({
				label: 'Delete permanently…',
				icon: 'icon-[lucide--trash-2]',
				tone: 'danger',
				onselect: () => ask([entry])
			});
		return items;
	}

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
				class="min-w-0 flex-1 input"
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
		<div class="space-y-6">
			{#each days as [heading, workspaces] (heading)}
				<section class="space-y-2">
					<h2 class="label">{heading}</h2>
					<ul class="card p-2">
						{#each workspaces as entry (entry.id)}
							<li>
								<button
									type="button"
									class="item w-full gap-3 px-3 py-2 text-left hover:bg-hover focus-visible:bg-hover"
									disabled={!onrestore}
									onclick={() => askToRestore(entry)}
									{@attach contextMenu(() => menu(entry))}
								>
									<span
										class="grid size-9 shrink-0 place-items-center rounded-control bg-sunken text-muted"
										aria-hidden="true"
									>
										{#if entry.repoId !== null}
											<RepoIcon id={entry.repoId} />
										{:else}
											<span class="icon-[lucide--folders] size-5"></span>
										{/if}
									</span>
									<span class="min-w-0 flex-1">
										<span
											class="line-clamp-2 font-medium wrap-anywhere text-ink sm:block sm:truncate"
											>{entry.title}</span
										>
										<span class="block truncate text-xs text-muted">{entry.repository}</span>
									</span>
									<time class="shrink-0 text-xs text-muted tabular-nums" datetime={entry.archivedAt}
										>{time.format(new Date(entry.archivedAt))}</time
									>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{:else}
				<p class="empty">No matching workspaces.</p>
			{/each}
		</div>
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

<Dialog
	bind:open={() => restoring !== null, (open) => !open && !busy && (restoring = null)}
	label={restoring ? `Restore “${restoring.title}”?` : ''}
	class="max-w-lg"
>
	<div class="flex flex-col gap-4 p-6">
		<p class="heading wrap-anywhere">Restore “{restoring?.title}”?</p>
		<p class="text-sm">
			It returns to the sidebar{restoring?.repoId !== null
				? ', with its worktree checked out again from its branch'
				: ''}.
		</p>
		{#if problem}<p class="text-sm text-danger" role="alert">{problem}</p>{/if}
		<div class="dialog-actions">
			<Button variant="soft" disabled={busy} onclick={() => (restoring = null)}>Cancel</Button>
			<Button variant="primary" {busy} onclick={restore}>Restore</Button>
		</div>
	</div>
</Dialog>
