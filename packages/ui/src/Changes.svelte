<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { groupChanges, type ChangeRow } from './changeGroups.ts';
	import Spinner from './Spinner.svelte';
	import DiffStat from './DiffStat.svelte';
	import FittedPath from './FittedPath.svelte';
	import type { Changes } from '@geordi/protocol';

	type Props = {
		/**
		 * How the workspace's files and its pull request stand, kept up to date by the forge
		 * (see `getWorkspace`). `null` until first loaded.
		 */
		git: { changes: Changes | null; unavailable: string | null } | null;
		/** The branch of a worktree that was removed outside Geordi, if that is what happened. */
		gone?: string | null;
		onopen(path: string): void;
	};
	let { git, gone = null, onopen }: Props = $props();

	const files = $derived(git?.changes?.files ?? []);

	const groups = $derived(groupChanges(files));
	const expanded = new SvelteMap<string, boolean>();

	type File = (typeof files)[number];
	const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);

	/** Git's letter for what became of a file, and what that means in words. */
	function flag(file: File): { letter: string; tone: string; means: string } {
		switch (file.status) {
			case 'added':
				return { letter: 'A', tone: 'text-ok', means: 'Added' };
			case 'deleted':
				return { letter: 'D', tone: 'text-danger', means: 'Deleted' };
			case 'renamed': {
				// the same name in another place is a move; Git calls both a rename
				const from = file.from ?? '';
				const moved = from.slice(dirOf(from).length) === file.path.slice(dirOf(file.path).length);
				return {
					letter: 'R',
					tone: 'text-muted',
					means: `${moved ? 'Moved' : 'Renamed'} from ${from}`
				};
			}
			default:
				return { letter: 'M', tone: 'text-muted', means: 'Modified' };
		}
	}
</script>

<section class="flex min-h-0 flex-1 flex-col" aria-label="Changes">
	<div class="scroller py-1.5">
		{#if gone}
			<!-- what happened, calmly; the way out is in the workspace's title bar -->
			<div class="space-y-1.5 px-3.5 py-2 text-sm text-muted">
				<p class="font-medium text-ink">The worktree was removed outside Geordi.</p>
				<p>
					Restoring it, or simply your next message, brings back everything committed on
					<span class="code-dense">{gone}</span>. Changes that weren't committed are gone.
				</p>
			</div>
		{:else if !git || (!git.changes && !git.unavailable)}
			<p class="flex items-center gap-2 px-3.5 py-2 text-sm text-muted">
				<Spinner label="Loading the changes" /> Loading…
			</p>
		{:else if git.unavailable}
			<p class="px-3.5 py-2 text-sm text-muted">{git.unavailable}</p>
		{:else if files.length === 0}
			<!-- nothing to list: a quiet word in the middle of the pane, not a line in its corner -->
			<div class="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
				<span class="icon-[lucide--file-diff] size-6 text-muted opacity-60"></span>
				<p class="text-sm font-medium text-ink">No changes yet</p>
			</div>
		{:else}
			{#if git.changes?.comparisonTarget}
				<p class="truncate px-3.5 py-1 text-xs text-muted" title={git.changes.comparisonTarget}>
					Compared with <span class="code-dense">{git.changes.comparisonTarget}</span>
				</p>
			{/if}
			{@render rows(groups, '')}
		{/if}
	</div>
</section>

{#snippet rows(entries: ChangeRow[], prefix: string)}
	<ul class:pl-3={!!prefix}>
		{#each entries as row (row.path)}
			<li>
				{#if 'file' in row}
					{@const file = row.file}
					{@const { letter, tone, means } = flag(file)}
					<button
						type="button"
						onclick={() => onopen(file.path)}
						title="{means}: {file.path}"
						class="flex w-full items-center gap-2.5 overflow-hidden px-3.5 py-1 text-left code-dense whitespace-nowrap hover:bg-hover"
					>
						<span class={['w-2 shrink-0 text-center font-semibold', tone]} aria-label={means}>
							{letter}
						</span>
						<!-- the name is what is looked for: where room runs out, the directories give way
							     first (`fitPath`); the full path is in the row's tooltip -->
						<FittedPath
							path={row.path.slice(prefix.length)}
							class={{ 'line-through': file.status === 'deleted' }}
						/>
						<DiffStat added={file.added} removed={file.removed} />
					</button>
				{:else}
					{@const open = expanded.get(row.path) ?? row.children.length < 8}
					<button
						type="button"
						aria-expanded={open}
						title={row.path}
						onclick={() => expanded.set(row.path, !open)}
						class="flex w-full items-center gap-2.5 px-3.5 py-1 text-left text-xs text-muted hover:bg-hover"
					>
						<span
							aria-hidden="true"
							class={['icon-[lucide--chevron-right] size-3 shrink-0', open && 'rotate-90']}
						></span>
						<span class="min-w-0 flex-1 truncate code-dense">{row.path.slice(prefix.length)}</span>
						<span class="shrink-0">{row.count} files</span>
						{#if row.added || row.removed}
							<DiffStat added={row.added} removed={row.removed} />
						{/if}
					</button>
					{#if open}
						{@render rows(row.children, row.path)}
					{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}
