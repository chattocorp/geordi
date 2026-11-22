<script lang="ts">
	import EmptyState from './EmptyState.svelte';
	import Button from './Button.svelte';
	import ProgressIcon from './ProgressIcon.svelte';
	import DiffStat from './DiffStat.svelte';
	import FittedPath from './FittedPath.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Attachment } from 'svelte/attachments';
	import { fileTree, treeRows } from './tree.ts';
	import type { Changes } from '@geordi/protocol';

	type View = 'list' | 'tree';

	type Props = {
		/**
		 * How the workspace's files and its pull request stand, kept up to date by the forge
		 * (see `getWorkspace`). `null` until first loaded.
		 */
		git: { changes: Changes | null; unavailable: string | null } | null;
		/** The branch of a worktree that was removed outside Geordi, if that is what happened. */
		gone?: string | null;
		onopen(path: string): void;
		onopencombined?: () => void;
		/** The files as one list, in Git's order, or arranged in their directories. */
		view?: View;
	};
	let { git, gone = null, onopen, onopencombined, view = $bindable('list') }: Props = $props();

	const files = $derived(git?.changes?.files ?? []);
	/** Whether there are files to list, and so a choice of how to show them. */
	const listed = $derived(!gone && !git?.unavailable && files.length > 0);
	/** Directories folded shut in the tree, by path; all are open to begin with. */
	const folded = new SvelteSet<string>();
	const rows = $derived(view === 'tree' ? treeRows(fileTree(files), folded) : []);

	/**
	 * A branch may change thousands of files: rows are drawn some hundred at a time, more as
	 * the end of what is drawn comes near. (Not a virtualized list: one broke as the page
	 * rendered another workspace in the background.)
	 */
	const PAGE = 200;
	let drawn = $state(PAGE);
	// shown another way, it starts again from the top
	$effect.pre(() => {
		void view;
		drawn = PAGE;
	});
	const more: Attachment<HTMLElement> = (node) => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) drawn += PAGE;
			},
			{ root: node.closest('.scroller'), rootMargin: '600px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	};
	const views: { value: View; label: string; icon: string }[] = [
		{ value: 'list', label: 'As a list', icon: 'icon-[lucide--list]' },
		{ value: 'tree', label: 'As a tree', icon: 'icon-[lucide--list-tree]' }
	];

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

<section class="flex min-h-0 flex-1 flex-col text-sm" aria-label="Changes">
	{#if listed}
		<div class="flex shrink-0 items-center gap-2 pt-1.5 pr-2 pl-3.5">
			<p class="min-w-0 flex-1 truncate text-muted" title={git?.changes?.comparisonTarget}>
				{#if git?.changes?.comparisonTarget}
					Compared with <span>{git.changes.comparisonTarget}</span>
				{/if}
			</p>
			<div class="flex shrink-0 items-center">
				{#if onopencombined}
					<Button
						variant="tool"
						icon="icon-[lucide--files]"
						label="Open combined diff"
						onclick={onopencombined}
					/>
				{/if}
				<div role="radiogroup" aria-label="Show the changes" class="flex">
					{#each views as option (option.value)}
						<Button
							variant="tool"
							role="radio"
							aria-checked={view === option.value}
							icon={option.icon}
							label={option.label}
							onclick={() => (view = option.value)}
						/>
					{/each}
				</div>
			</div>
		</div>
	{/if}
	<div class="scroller py-1.5">
		{#if gone}
			<!-- what happened, calmly; the way out is in the workspace's title bar -->
			<div class="space-y-1.5 px-3.5 py-2 text-muted">
				<p class="font-medium text-ink">The worktree was removed outside Geordi.</p>
				<p>
					Restoring it, or simply your next message, brings back everything committed on
					{gone}. Changes that weren't committed are gone.
				</p>
			</div>
		{:else if !git || (!git.changes && !git.unavailable)}
			<p class="flex items-center gap-2 px-3.5 py-2 text-muted">
				<ProgressIcon label="Loading the changes" /> Loading…
			</p>
		{:else if git.unavailable}
			<p class="px-3.5 py-2 text-muted">{git.unavailable}</p>
		{:else if files.length === 0}
			<EmptyState icon="icon-[lucide--file-diff]" title="No changes yet" class="min-h-full" />
		{:else if view === 'tree'}
			<ul class="space-y-px px-2">
				{#each rows.slice(0, drawn) as row (row.path)}
					<li>
						{#if row.kind === 'dir'}
							<button
								type="button"
								aria-label={row.name}
								aria-expanded={row.open}
								onclick={() => (row.open ? folded.add(row.path) : folded.delete(row.path))}
								title={row.path}
								style:padding-left="{0.375 + row.depth * 1.25}rem"
								class="row item w-full gap-1.5 overflow-hidden pr-1.5 text-left whitespace-nowrap"
							>
								<span
									class={[
										'icon-[lucide--chevron-right] size-3.5 shrink-0',
										row.open && 'rotate-90'
									]}
								></span>
								<FittedPath path={row.name} />
							</button>
						{:else}
							{@render file(row.file, row.depth)}
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<ul class="space-y-px px-2">
				{#each files.slice(0, drawn) as entry (entry.path)}
					<li>{@render file(entry)}</li>
				{/each}
			</ul>
		{/if}
		{#if listed && (view === 'tree' ? rows : files).length > drawn}
			{#key drawn}<div class="h-px" {@attach more}></div>{/key}
		{/if}
	</div>
</section>

<!-- a file's row: in the list with its path, in the tree with its name at its depth -->
{#snippet file(entry: File, depth?: number)}
	{@const { letter, tone, means } = flag(entry)}
	{@const deleted = entry.status === 'deleted'}
	<button
		type="button"
		onclick={() => onopen(entry.path)}
		title="{means}: {entry.path}"
		style:padding-left={depth === undefined ? undefined : `${0.375 + depth * 1.25}rem`}
		class={[
			// as in every list: the row's shape and wash are `item`'s; a file's name is ink
			'row item w-full overflow-hidden pr-1.5 text-left whitespace-nowrap text-ink',
			depth === undefined ? 'gap-2.5 pl-1.5' : 'gap-1.5'
		]}
	>
		<span
			class={['shrink-0 text-center font-semibold', depth === undefined ? 'w-2' : 'w-3.5', tone]}
			aria-label={means}
		>
			{letter}
		</span>
		{#if depth === undefined}
			<!-- the name is what is looked for: where room runs out, the directories give way
			     first (`fitPath`); the full path is in the row's tooltip -->
			<FittedPath path={entry.path} class={{ 'line-through': deleted }} />
		{:else}
			<span class={['min-w-0 flex-1 truncate', deleted && 'line-through']}>
				{entry.path.slice(entry.path.lastIndexOf('/') + 1)}
			</span>
		{/if}
		<DiffStat class="text-xs tabular-nums" added={entry.added} removed={entry.removed} />
	</button>
{/snippet}
