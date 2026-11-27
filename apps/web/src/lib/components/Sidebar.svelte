<script lang="ts">
	import { resolve } from '$app/paths';
	import type { WorkspaceStanding } from '@geordi/ui/actions';
	import Dialog from '#lib/ui/Dialog.svelte';
	import RepoPicker from '#lib/components/workspace/RepoPicker.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import ConnectionIndicator from './ConnectionIndicator.svelte';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import { settingsPath } from '#lib/components/settings.svelte.ts';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import {
		actFromAfar,
		archiveAndNavigate,
		continueFromAfar,
		setInactive
	} from '#lib/components/workspace/afar.svelte.ts';
	import { beingArchived } from '#lib/components/workspace/archive.svelte.ts';
	import { pendingPullAction, pullActionPending } from '#lib/components/workspace/review.svelte.ts';
	import { dropTarget, type DropPlace, outlineRows } from '#lib/family.ts';
	import OutlineItemRow from './OutlineItemRow.svelte';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { hint } from '@geordi/ui/keys';
	import { unread } from '#lib/notifications.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import { contextMenu, type MenuItem, type MenuTone } from '#lib/ui/menu.svelte.ts';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { foreground } from '#lib/foreground.svelte.ts';
	import {
		addItem,
		completeItem,
		editItem,
		lockWorkspace,
		moveItem,
		removeItem,
		renameWorkspace,
		stopAgent
	} from '../../routes/workspaces.remote';

	/**
	 * The sidebar is the outline (FDR-019): every item, workspaces among them, and the
	 * navigation links below it. `nav` is what there is, once known; `path` is the page on
	 * screen, which is marked. `folded` is what is folded away under items; `focus` the
	 * repository shown alone, if any; `activeOnly` whether what is done or inactive is left out.
	 */
	let {
		nav,
		path,
		folded,
		focus,
		activeOnly = $bindable(true),
		repositoryPickerOpen = $bindable(false),
		lost = false
	}: {
		nav: Navigation | undefined;
		path: string;
		folded: { current: string[] };
		focus: { current: string | null };
		activeOnly?: boolean;
		repositoryPickerOpen?: boolean;
		lost?: boolean;
	} = $props();

	type Item = Navigation['workspaces'][number];

	const withWorkspaces = $derived(nav?.repos.filter((repo) => repo.workspaceCount > 0) ?? []);
	const repoNames = $derived(new Map(nav?.repos.map((repo) => [repo.id, repo.name])));
	/** The workspaces in use, by ID: what the outline's items with workspaces show. */
	const workspaceById = $derived(new Map(nav?.workspaces.map((each) => [each.id, each])));
	/** Ticks an item off, or not: it stays where it is, crossed out. */
	const tickOff = (entry: { id: string; done: boolean }) =>
		completeItem({ itemId: entry.id, done: !entry.done });
	const viewed = $derived(path.match(/^\/workspaces\/([^/]+)$/)?.[1] ?? null);
	/** The rows shown, top to bottom. */
	const rows = $derived(
		nav
			? outlineRows(nav.items, nav.workspaces, {
					activeOnly,
					focus: focus.current,
					folded: folded.current,
					viewed
				})
			: []
	);
	type Row = (typeof rows)[number];
	type Entry = Row['workspace'];

	/**
	 * Repositories and workspaces slide in and out whenever they come or go: by a filter (the
	 * focus, only the active ones) or on their own. Not when the list first arrives: it is drawn in
	 * `{#if nav}`, and a transition is local, so it plays only when its own block changes.
	 */
	const motion = () => ({
		duration: prefersReducedMotion.current ? 0 : MOTION,
		easing: cubicOut
	});
	/**
	 * A workspace counts as working, for archiving, while anything its agent started is. Not
	 * a project's: what it started in a repository carries on without it.
	 */
	const working = (workspace: Item): boolean =>
		workspace.working ||
		(workspace.repoId !== null &&
			(nav?.workspaces ?? []).some((other) => other.parentId === workspace.id && working(other)));
	/**
	 * The workspace, of this one and what its agents started, whose agent waits for the
	 * person's answer: a folded row stands for all of them, and must not hide a question.
	 */
	const asker = (workspace: Item): Item | undefined =>
		workspace.outcome === 'asking'
			? workspace
			: (nav?.workspaces ?? [])
					.filter((other) => other.parentId === workspace.id)
					.map(asker)
					.find((found) => found);
	/** The parent of the workspace the pointer is on: lit up, to show who it belongs to. */
	let pointedAt = $state<string | null>(null);

	/** The colour of what to do next, from how the workspace stands: as in its ribbon. */
	const actionTone = (standing: WorkspaceStanding | null): MenuTone =>
		standing?.tone === 'ok' || standing?.tone === 'merged' ? standing.tone : 'accent';

	let nameInput = $state<HTMLInputElement>();
	let renaming = $state<{ id: string; title: string; problem: string; saving: boolean } | null>(
		null
	);

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		const draft = renaming;
		if (!draft || draft.saving || !draft.title.trim()) return;
		draft.saving = true;
		try {
			await renameWorkspace({ workspaceId: draft.id, title: draft.title });
			if (renaming === draft) renaming = null;
		} catch (cause) {
			draft.problem = cause instanceof Error ? cause.message : 'Could not rename this workspace.';
		} finally {
			draft.saving = false;
		}
	}

	/** What can be done with a workspace from the sidebar, without opening it. */
	function workspaceMenu(workspace: Item): MenuItem[] {
		const href = resolve('/workspaces/[id]', { id: workspace.id });
		const running = workspace.status === 'running';
		const project = workspace.repoId === null;
		// archiving takes the workspaces its agent started along: none of them may be working
		const busy = working(workspace);
		// the menu has these already, below
		const next = workspace.actions.filter(({ id }) => id !== 'continue' && id !== 'archive');
		return [
			...next.map((action) => ({
				label: action.label,
				icon: action.icon,
				tone: actionTone(workspace.standing),
				disabled: pullActionPending(workspace.id, action),
				onselect: () => actFromAfar(workspace, action)
			})),
			...(next.length > 0 ? ['separator' as const] : []),
			{
				label: 'Open in new tab',
				icon: 'icon-[lucide--external-link]',
				onselect: () => window.open(href, '_blank', 'noopener')
			},
			{
				label: 'Rename workspace',
				icon: 'icon-[lucide--pencil]',
				onselect: () => {
					renaming = { id: workspace.id, title: workspace.title, problem: '', saving: false };
				}
			},
			{
				label: 'Copy ID',
				icon: 'icon-[lucide--hash]',
				onselect: () => navigator.clipboard.writeText(workspace.id)
			},
			// its own todos (FDR-019)
			...(project
				? []
				: [
						{
							label: 'Add an item under it',
							icon: 'icon-[lucide--list-plus]',
							onselect: () => {
								const index = rows.findIndex((row) => row.workspace.id === workspace.id);
								const child = rows[index + 1]?.depth > rows[index]?.depth;
								return newItem(workspace.id, child ? idAt(index + 1) : null);
							}
						}
					]),
			// a project has no branch to copy or carry on from
			...(project
				? []
				: [
						{
							label: 'Copy branch name',
							icon: 'icon-[lucide--git-branch]',
							disabled: !workspace.branch,
							onselect: () => navigator.clipboard.writeText(workspace.branch ?? '')
						}
					]),
			'separator',
			...(project
				? []
				: [
						{
							label: 'Continue on a new branch',
							icon: 'icon-[lucide--git-branch-plus]',
							disabled: busy,
							onselect: () => continueFromAfar(workspace)
						}
					]),
			{
				label: 'Stop agent',
				icon: 'icon-[lucide--square]',
				disabled: !running,
				onselect: () => stopAgent(workspace.id)
			},
			// put aside for later, until the person marks it active or next prompts it
			{
				label: workspace.inactive ? 'Mark as active' : 'Mark as inactive',
				icon: workspace.inactive ? 'icon-[lucide--activity]' : 'icon-[lucide--moon]',
				onselect: () => setInactive(workspace, !workspace.inactive, activeOnly)
			},
			{
				label: workspace.locked ? 'Unlock' : 'Lock',
				icon: workspace.locked ? 'icon-[lucide--lock-open]' : 'icon-[lucide--lock]',
				onselect: () => lockWorkspace({ workspaceId: workspace.id, locked: !workspace.locked })
			},
			// a locked workspace can't be archived (FDR-015)
			...(workspace.locked
				? []
				: [
						{
							label: 'Archive',
							icon: 'icon-[lucide--archive]',
							tone: 'merged' as const,
							disabled: beingArchived.has(workspace.id),
							onselect: () => archiveAndNavigate(workspace)
						}
					])
		];
	}

	/**
	 * The item being dragged to another place in the outline (FDR-016, FDR-019), and where it
	 * would go, if anywhere new: above a row, onto it (under that item) or below it, or below
	 * the last row. What is under it goes along; the workspaces among that report to the
	 * workspace of the nearest item above them.
	 */
	let dragged = $state<Entry | null>(null);
	let dropAt = $state<ReturnType<typeof dropTarget<Entry>>>(undefined);

	/**
	 * How deep the pointer is in the list: one level for each indent from its left edge.
	 * Where a gap between rows allows more than one depth, this picks it.
	 */
	function depthAt(event: DragEvent) {
		const left = list?.getBoundingClientRect().left ?? 0;
		const indent = INDENT * parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.25;
		return Math.floor((event.clientX - left) / indent);
	}

	/**
	 * Over the list: the row at the pointer's height, whether or not the pointer is over the
	 * row itself (rows are indented; moving left, to go up a level, leaves them). A row's upper
	 * quarter is the gap above it, its lower quarter the gap below it, and the rest is the row
	 * itself (under it); below the last row is the gap after it. The gap between two rows is
	 * one place, from either side.
	 */
	function overList(event: DragEvent & { currentTarget: HTMLElement }) {
		if (!dragged) return;
		const shown = [...event.currentTarget.querySelectorAll<HTMLElement>(':scope > li[data-row]')];
		if (!shown.length) return;
		const y = event.clientY;
		const index = shown.findIndex((li) => y < li.getBoundingClientRect().bottom);
		let place: DropPlace;
		if (index === -1) place = { after: rows.length - 1, depth: depthAt(event) };
		else {
			const rect = shown[index].getBoundingClientRect();
			const at = (y - rect.top) / rect.height;
			place =
				at < 1 / 4
					? { after: index - 1, depth: depthAt(event) }
					: at > 3 / 4
						? { after: index, depth: depthAt(event) }
						: { onto: index };
		}
		event.preventDefault();
		dropAt = dropTarget(rows, dragged, place, true);
		if (event.dataTransfer) event.dataTransfer.dropEffect = dropAt ? 'move' : 'none';
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		if (dragged && dropAt) {
			const { before, parentId, reparents } = dropAt;
			void moveItem({ itemId: dragged.id, before, ...(reparents && { parentId }) });
		}
		endDrag();
	}

	function endDrag() {
		dragged = null;
		dropAt = undefined;
	}

	// --- Editing the outline, as in any outliner (FDR-019) ---------------------------------

	/** The row a row is under, among those shown: the nearest one above it that is less deep. */
	function parentIndex(index: number) {
		for (let above = index - 1; above >= 0; above--)
			if (rows[above].depth < rows[index].depth) return above;
		return -1;
	}
	/** The next (`step` 1) or previous (-1) row with the same parent, if any. */
	function siblingIndex(index: number, step: 1 | -1) {
		for (let at = index + step; at >= 0 && at < rows.length; at += step) {
			if (rows[at].depth < rows[index].depth) return -1;
			if (rows[at].depth === rows[index].depth) return at;
		}
		return -1;
	}
	const idAt = (index: number) => (index === -1 ? null : rows[index].workspace.id);

	/** The list of rows, for finding what to focus in it. */
	let list = $state<HTMLElement>();
	/** A row to focus once the outline shows it as `ready` says: once a change has come back. */
	let focusing = $state<{ id: string; ready: (index: number) => boolean } | null>(null);
	$effect(() => {
		const pending = focusing;
		if (!pending) return;
		const index = rows.findIndex((row) => row.workspace.id === pending.id);
		if (index === -1 || !pending.ready(index)) return;
		focusing = null;
		void tick().then(() => focusRow(pending.id));
	});
	function focusRow(id: string | null) {
		if (!id) return;
		const row = list?.querySelector(`[data-row="${CSS.escape(id)}"]`);
		row?.querySelector<HTMLElement>('input, a[href]')?.focus();
	}
	const unfold = (id: string) => (folded.current = folded.current.filter((other) => other !== id));

	/** Writes a new, empty item and puts the cursor in it. */
	async function newItem(parentId: string | null, before: string | null) {
		if (parentId) unfold(parentId);
		const id = await addItem({ parentId, before, text: '' });
		focusing = { id, ready: () => true };
	}

	/** Moves the item, and keeps the cursor in it once it is where it was moved. */
	async function moveKeeping(entry: Entry, before: string | null, parentId?: string | null) {
		await moveItem({ itemId: entry.id, before, ...(parentId !== undefined && { parentId }) });
		focusing = {
			id: entry.id,
			ready: (index) =>
				idAt(parentIndex(index)) === (parentId === undefined ? entry.parentId : parentId) &&
				idAt(siblingIndex(index, 1)) === before
		};
	}

	/** What the keys do in an item's line, as in any outliner. */
	async function itemKeys(
		event: KeyboardEvent & { currentTarget: HTMLInputElement },
		index: number
	) {
		const entry = rows[index].workspace;
		const input = event.currentTarget;
		const text = input.value;
		const save = () => (text !== entry.text ? editItem({ itemId: entry.id, text }) : undefined);
		const mod = event.metaKey || event.ctrlKey;
		if (event.key === 'Enter' && mod) {
			event.preventDefault();
			await save();
			await tickOff(entry);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			await save();
			await newItem(idAt(parentIndex(index)), idAt(siblingIndex(index, 1)));
		} else if (event.key === 'Tab' && !event.shiftKey) {
			event.preventDefault();
			const above = siblingIndex(index, -1);
			if (above === -1 || rows[above].workspace.project) return;
			await save();
			unfold(idAt(above)!);
			await moveKeeping(entry, null, idAt(above));
		} else if (event.key === 'Tab') {
			event.preventDefault();
			const parent = parentIndex(index);
			if (parent === -1) return;
			await save();
			await moveKeeping(entry, idAt(siblingIndex(parent, 1)), idAt(parentIndex(parent)));
		} else if (event.altKey && event.key === 'ArrowUp') {
			event.preventDefault();
			const above = siblingIndex(index, -1);
			if (above !== -1) await moveKeeping(entry, idAt(above));
		} else if (event.altKey && event.key === 'ArrowDown') {
			event.preventDefault();
			const below = siblingIndex(index, 1);
			if (below !== -1) await moveKeeping(entry, idAt(siblingIndex(below, 1)));
		} else if (
			event.key === 'Backspace' &&
			text === '' &&
			rows[index + 1]?.depth !== rows[index].depth + 1
		) {
			event.preventDefault();
			focusRow(idAt(index - 1));
			await removeItem({ itemId: entry.id });
		} else if (event.key === 'Escape') {
			input.value = entry.text;
			input.blur();
		}
	}

	/** Up and down go from row to row, workspaces and items alike. */
	function rowKeys(event: KeyboardEvent, index: number) {
		if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
		const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (!step || !rows[index + step]) return;
		event.preventDefault();
		focusRow(idAt(index + step));
	}

	/** What can be done with an item without a workspace. */
	function itemMenu(entry: Entry, index: number): MenuItem[] {
		const firstChild = rows[index + 1]?.depth > rows[index].depth ? idAt(index + 1) : null;
		return [
			{
				label: 'Start a workspace on it',
				icon: 'icon-[lucide--play]',
				// the start page, with the item to start it on
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()d, with a query
				onselect: () => void goto(`${resolve('/')}?item=${encodeURIComponent(entry.id)}`)
			},
			{
				label: 'Add an item under it',
				icon: 'icon-[lucide--list-plus]',
				onselect: () => newItem(entry.id, firstChild)
			},
			{
				label: entry.done ? 'Mark as not done' : 'Mark as done',
				icon: entry.done ? 'icon-[lucide--circle]' : 'icon-[lucide--circle-check]',
				onselect: () => tickOff(entry)
			},
			'separator',
			{
				label: 'Remove',
				icon: 'icon-[lucide--trash-2]',
				tone: 'danger' as const,
				onselect: () => removeItem({ itemId: entry.id })
			}
		];
	}

	const toggleFolded = (id: string) =>
		(folded.current = folded.current.includes(id)
			? folded.current.filter((other) => other !== id)
			: [...folded.current, id]);

	/** The two markers stay at the ends as groups expand, fold or move. */
	function watchScrollEdges(list: HTMLElement) {
		const top = list.firstElementChild!;
		const bottom = list.lastElementChild!;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					list.classList.toggle(
						entry.target === top ? 'more-above' : 'more-below',
						!entry.isIntersecting
					);
				}
			},
			// a pixel's leeway: rows of fractional height can leave the end a hair out of reach
			{ root: list, rootMargin: '1px' }
		);
		observer.observe(top);
		observer.observe(bottom);
		return () => observer.disconnect();
	}

	const settingsHint = hint('settings');
	/**
	 * How far a row sits in from the item it is under: its sign under the title above (a
	 * row's label padding, its sign, and the gap after it, less where a repository's smaller
	 * picture sits in its sign's place).
	 */
	const INDENT = 6.5;
	/** How long repositories and workspaces take to slide away or back, in milliseconds. */
	const MOTION = 200;
	const inSettings = $derived(path.startsWith('/settings'));
</script>

<Dialog
	label="Rename workspace"
	onopen={() => {
		nameInput?.focus();
		nameInput?.select();
	}}
	class="max-w-md"
	bind:open={
		() => !!renaming,
		(open) => {
			if (!open) renaming = null;
		}
	}
>
	{#if renaming}
		<form onsubmit={saveName} class="space-y-4 p-6">
			<h2 class="heading">Rename workspace</h2>
			<label class="block">
				<span class="label">Workspace name</span>
				<input
					class="mt-1 w-full input"
					maxlength="80"
					required
					value={renaming.title}
					oninput={(event) => {
						if (renaming) renaming.title = event.currentTarget.value;
					}}
					bind:this={nameInput}
				/>
			</label>
			{#if renaming.problem}<p role="alert" class="text-sm text-danger">{renaming.problem}</p>{/if}
			<div class="flex justify-end gap-2">
				<Button variant="soft" onclick={() => (renaming = null)}>Cancel</Button>
				<Button
					type="submit"
					variant="primary"
					busy={renaming.saving}
					disabled={!renaming.title.trim()}
				>
					Rename
				</Button>
			</div>
		</form>
	{/if}
</Dialog>

<div class="flex min-h-0 min-w-0 flex-1 flex-col sheet-quiet select-none">
	<nav class="flex min-h-0 flex-1 flex-col p-2" aria-label="Main">
		<div
			role="group"
			aria-label="Workspace filters"
			class="mb-2 flex shrink-0 items-center justify-between gap-1"
		>
			<RepoPicker
				all="All repositories"
				buttonIcon={false}
				title={`Search repositories (${hint('repositoryFilter')})`}
				bind:open={repositoryPickerOpen}
				repos={withWorkspaces}
				bind:value={() => focus.current ?? '', (value) => (focus.current = value || null)}
			/>
			<div class="tools">
				<Button
					variant="ghost"
					icon="icon-[lucide--activity]"
					label="Show only what is active"
					title={`Show only what is active: no archived or inactive workspaces (${hint('activeOnly')})`}
					aria-pressed={activeOnly}
					onclick={() => (activeOnly = !activeOnly)}
				/>
			</div>
		</div>

		<div class="scroller -mx-2 scroll-fade px-2" {@attach watchScrollEdges}>
			<div aria-hidden="true"></div>
			{#if nav}
				<ul
					class="space-y-px pb-4"
					bind:this={list}
					ondragover={overList}
					ondrop={drop}
					ondragleave={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node | null))
							dropAt = undefined;
					}}
				>
					{#each rows as { workspace: entry, parent, depth, under }, index (entry.id)}
						{@render row(entry, parent, depth, under, index)}
					{/each}
					<!-- the outline's last line: where something new is written (FDR-019) -->
					<li>
						<button
							type="button"
							class="item w-full gap-1 px-1 text-base text-faint"
							onclick={() => newItem(null, null)}
						>
							<span class="grid size-6 shrink-0 place-items-center">
								<span class="icon-[lucide--plus] size-4"></span>
							</span>
							<span class="py-1">New item</span>
						</button>
					</li>
				</ul>
				{#if rows.length === 0 && nav.items.length > 0}
					<p class="px-2 py-1 text-sm text-muted">Everything is done or put aside.</p>
				{/if}
			{/if}
			<div aria-hidden="true"></div>
		</div>
	</nav>

	<nav class="p-2" aria-label="Workspace navigation">
		<ConnectionIndicator {lost} class="px-2.5 py-1" />
		{@render link(resolve('/'), 'icon-[lucide--plus]', 'New workspace', path === '/')}
		{@render link(resolve('/archive'), 'icon-[lucide--archive]', 'Archive', path === '/archive')}
		<a
			href={settingsPath()}
			class={['item gap-2.5 px-2.5 py-1.5 text-base', inSettings && 'item-active font-medium']}
			aria-current={inSettings ? 'page' : undefined}
		>
			<span class="icon-[lucide--settings] size-4 shrink-0"></span>
			Settings
			<kbd class="ml-auto font-sans text-xs text-muted">{settingsHint}</kbd>
		</a>
	</nav>
</div>

{#snippet row(entry: Entry, parent: Entry | null, depth: number, under: number, index: number)}
	{@const workspace = entry.workspace ? workspaceById.get(entry.id) : undefined}
	{@const isFolded = under > 0 && folded.current.includes(entry.id)}
	{@const current = path === `/workspaces/${entry.id}`}
	{@const busy = workspace ? working(workspace) : false}
	{@const asking =
		workspace && (isFolded ? asker(workspace) : workspace.outcome === 'asking' && workspace)}
	{@const leaving = beingArchived.has(entry.id)}
	{@const dropping = dropAt && dropAt.line.id === entry.id ? dropAt.line.edge : null}
	<!-- an archived workspace's item: a done line, which stays where it is -->
	{@const archived = entry.workspace && !workspace}
	{#snippet repoIcon()}<RepoIcon
			id={workspace!.repoId!}
			name={repoNames.get(workspace!.repoId!) ?? ''}
			small
		/>{/snippet}
	<!-- one sits a little in from the item it is under -->
	<!-- where an item being dragged would go: a line above or below this one, or onto it, lit up -->
	<!-- up and down go from row to row: the keys of what is focused in it, a link or a line -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<li
		data-row={entry.id}
		style:margin-inline-start="calc(var(--spacing) * {INDENT * depth})"
		style:--drop-indent={dropping && dropAt
			? `calc(var(--spacing) * ${INDENT * (dropAt.line.depth - depth)})`
			: undefined}
		class={[dropping === 'above' && 'row-drop-before', dropping === 'below' && 'row-drop-after']}
		transition:slide={motion()}
		{@attach contextMenu(() =>
			leaving || archived ? [] : workspace ? workspaceMenu(workspace) : itemMenu(entry, index)
		)}
		draggable={!leaving && !archived}
		onkeydown={(event) => rowKeys(event, index)}
		ondragstart={(event) => {
			dragged = entry;
			event.dataTransfer?.setData('text/plain', entry.text);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		}}
		ondragend={endDrag}
		onclickcapture={(event) => {
			// with only active workspaces shown, shift-click marks one inactive: not on what the row has to click besides its link
			if (!workspace || !activeOnly || !event.shiftKey || leaving) return;
			if (event.target instanceof Element && event.target.closest('button, [data-row-actions] a'))
				return;
			event.preventDefault();
			event.stopPropagation();
			void setInactive(workspace, true, activeOnly);
		}}
		ondblclick={(event) => {
			// not on what the row has to click besides its link
			if (!workspace) return;
			if (event.target instanceof Element && event.target.closest('button, [data-row-actions] a'))
				return;
			foreground.ask(workspace.id);
		}}
	>
		{#if workspace}
			<WorkspaceRow
				title={workspace.title}
				href={resolve('/workspaces/[id]', { id: workspace.id })}
				parentTitle={parent?.text}
				icon={workspace.repoId === null ? 'icon-[lucide--folder-kanban]' : repoIcon}
				{current}
				{leaving}
				dragging={dragged?.id === workspace.id}
				highlighted={pointedAt === workspace.id || dropping === 'onto'}
				unread={unread.has(workspace.id)}
				asking={asking ? resolve('/workspaces/[id]', { id: asking.id }) : false}
				waiting={workspace.waiting}
				working={workspace.working || (isFolded && busy)}
				locked={workspace.locked}
				inactive={workspace.inactive}
				progress={pendingPullAction.get(workspace.id) ??
					(workspace.actions.some((action) => pullActionPending(workspace.id, action))
						? 'merge-pull'
						: workspace.activeAction)}
				standing={workspace.standing}
				actions={workspace.actions}
				fold={under > 0
					? { count: under, folded: isFolded, toggle: () => toggleFolded(workspace.id) }
					: undefined}
				onpoint={(pointed) => (pointedAt = pointed ? (parent?.id ?? null) : null)}
				onaction={busy || leaving ? undefined : (action) => actFromAfar(workspace, action)}
				onadd={leaving || workspace.repoId === null ? undefined : () => newItem(workspace.id, null)}
			/>
		{:else}
			<OutlineItemRow
				id={entry.id}
				text={entry.text}
				done={entry.done}
				href={archived ? resolve('/workspaces/[id]', { id: entry.id }) : undefined}
				dragging={dragged?.id === entry.id}
				highlighted={pointedAt === entry.id || dropping === 'onto'}
				fold={under > 0
					? { count: under, folded: isFolded, toggle: () => toggleFolded(entry.id) }
					: undefined}
				onsave={(text) => editItem({ itemId: entry.id, text })}
				ontoggle={() => tickOff(entry)}
				onadd={archived ? undefined : () => newItem(entry.id, null)}
				onkeydown={(event) => itemKeys(event, index)}
			/>
		{/if}
	</li>
{/snippet}

{#snippet link(href: string, icon: string, label: string, current: boolean)}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass resolve()d hrefs -->
	<a
		{href}
		class={['item gap-2.5 px-2.5 py-1.5 text-base', current && 'item-active font-medium']}
		aria-current={current ? 'page' : undefined}
	>
		<span class={['size-4 shrink-0', icon]}></span>
		<span class="truncate">{label}</span>
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}
