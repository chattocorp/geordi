<script lang="ts">
	import Button from './Button.svelte';
	import Segmented from './Segmented.svelte';
	import Loading from './Loading.svelte';
	import DiffStat from './DiffStat.svelte';
	import FittedPath from './FittedPath.svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { Snippet } from 'svelte';
	import { fileTree, treeRows, type TreeRow } from './tree.ts';
	import { bySection, type Section } from './sections.ts';
	import type { Changes, RepoSection } from '@geordi/protocol';

	type View = 'list' | 'tree';
	type Folds = { sections: string[]; dirs: string[] };

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
		/**
		 * The branch the changes are compared with, if it is to be more than its name: a choice,
		 * looking like the name does (a button padded as a tool is, its sign first).
		 */
		target?: Snippet<[string]>;
		/** The repository's sections (from its `.geordi.yml`): the files are grouped by them. */
		sections?: RepoSection[];
		/**
		 * What is folded shut: sections by their path (`''` for Other), directories of the tree
		 * by theirs. Everything is open to begin with.
		 */
		folds?: Folds;
	};
	let {
		git,
		gone = null,
		onopen,
		onopencombined,
		view = $bindable('list'),
		target,
		sections = [],
		folds = $bindable({ sections: [], dirs: [] })
	}: Props = $props();

	const files = $derived(git?.changes?.files ?? []);
	/** Whether there are files to list, and so a choice of how to show them. */
	const listed = $derived(!gone && !git?.unavailable && files.length > 0);
	type File = (typeof files)[number];
	const folded = $derived(new Set(folds.dirs));
	/** Folds `key` of `kind` shut, or opens it. */
	const toggle = (kind: keyof Folds, key: string) =>
		(folds = {
			...folds,
			[kind]: folds[kind].includes(key)
				? folds[kind].filter((other) => other !== key)
				: [...folds[kind], key]
		});

	/** The files by the repository's sections; shown so only where there are two. */
	const groups = $derived(bySection(files, sections));
	/**
	 * Every line there is to draw, in order: a section's heading, then (unless it is folded)
	 * its files as a list or a tree. A tree within a section starts a level in, under the
	 * section's title.
	 */
	type Row =
		| { kind: 'section'; key: string; group: Section<File>; open: boolean }
		| { kind: 'entry'; key: string; file: File }
		| (TreeRow<File> & { key: string });
	const rowsOf = (entries: File[], level = 0): Row[] =>
		view === 'tree'
			? treeRows(fileTree(entries), folded, level).map((row) => ({
					...row,
					key: `${row.kind}:${row.path}`
				}))
			: entries.map((file) => ({ kind: 'entry', key: `entry:${file.path}`, file }));
	const rows = $derived(
		groups.length > 1
			? groups.flatMap((group): Row[] => {
					const open = !folds.sections.includes(group.path ?? '');
					return [
						{ kind: 'section', key: `section:${group.path ?? ''}`, group, open },
						...(open ? rowsOf(group.files, 1) : [])
					];
				})
			: rowsOf(files)
	);

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

	/** How far a row is indented, `depth` levels into the tree: a chevron and its gap each. */
	const inset = (depth: number) => `${0.875 + depth * 1.25}rem`;
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
		<!-- the branch's sign lines up with the files' letters below (the button pads it) -->
		<div class="flex shrink-0 items-center gap-2 pt-1.5 pr-2 pl-1.5">
			<div class="flex min-w-0 flex-1">
				{#if git?.changes?.comparisonTarget}
					{@const name = git.changes.comparisonTarget}
					{#if target}
						{@render target(name)}
					{:else}
						<span
							class="inline-flex h-8 min-w-0 items-center gap-1.5 px-2 text-muted"
							title="Compared with {name}"
						>
							<span class="icon-[lucide--git-compare] size-3.5 shrink-0"></span>
							<span class="truncate text-ink">{name}</span>
						</span>
					{/if}
				{/if}
			</div>
			<div class="tools">
				{#if onopencombined}
					<Button
						variant="ghost"
						icon="icon-[lucide--files]"
						label="Open combined diff"
						onclick={onopencombined}
					/>
				{/if}
				<Segmented label="Show the changes" icons bind:value={view} options={views} />
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
			<Loading label="Loading the changes…" />
		{:else if git.unavailable}
			<p class="px-3.5 py-2 text-muted">{git.unavailable}</p>
		{:else if files.length === 0}
			<!-- nothing to list: a quiet word in the middle of the pane, not a line in its corner -->
			<div class="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
				<span class="icon-[lucide--file-diff] size-6 text-muted opacity-60"></span>
				<p class="font-medium text-ink">No changes yet</p>
			</div>
		{:else}
			<ul>
				{#each rows.slice(0, drawn) as row, index (row.key)}
					<li class={[row.kind === 'section' && index > 0 && 'mt-1.5']}>
						{#if row.kind === 'section'}
							<button
								type="button"
								aria-expanded={row.open}
								onclick={() => toggle('sections', row.group.path ?? '')}
								title={row.group.path ?? undefined}
								class="flex w-full items-center gap-1.5 py-1 pr-3.5 pl-3.5 text-left whitespace-nowrap hover:bg-hover"
							>
								<span
									class={[
										'icon-[lucide--chevron-right] size-3.5 shrink-0 text-muted',
										row.open && 'rotate-90'
									]}
								></span>
								<span class="min-w-0 flex-1 truncate font-medium text-ink">{row.group.title}</span>
								<span class="shrink-0 text-muted tabular-nums">{row.group.files.length}</span>
							</button>
						{:else if row.kind === 'dir'}
							<button
								type="button"
								aria-label={row.name}
								aria-expanded={row.open}
								onclick={() => toggle('dirs', row.path)}
								title={row.path}
								style:padding-left={inset(row.depth)}
								class="flex w-full items-center gap-1.5 overflow-hidden py-1 pr-3.5 text-left whitespace-nowrap text-muted hover:bg-hover"
							>
								<span
									class={[
										'icon-[lucide--chevron-right] size-3.5 shrink-0',
										row.open && 'rotate-90'
									]}
								></span>
								<FittedPath path={row.name} />
							</button>
						{:else if row.kind === 'file'}
							{@render file(row.file, row.depth)}
						{:else}
							{@render file(row.file)}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if listed && rows.length > drawn}
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
		style:padding-left={inset(depth ?? 0)}
		class="flex w-full items-center gap-1.5 overflow-hidden py-1 pr-3.5 text-left whitespace-nowrap hover:bg-hover"
	>
		<span class={['w-3.5 shrink-0 text-center font-semibold', tone]} aria-label={means}>
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
