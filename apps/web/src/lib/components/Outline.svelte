<script module lang="ts">
	import type { outlineRows } from '#lib/family.ts';

	export type Row = ReturnType<typeof outlineRows>[number];
	export type Entry = Row['workspace'];
	/** What a workspace's row is given, to show itself. */
	export type WorkspaceRowProps = {
		entry: Entry;
		parent: Entry | null;
		under: number;
		fold: { count: number; folded: boolean; toggle(): void } | undefined;
		isFolded: boolean;
		dragging: boolean;
		/** Lit up: a drop would put the dragged item under it. */
		target: boolean;
	};
</script>

<script lang="ts">
	/**
	 * The outline editor (FDR-019): rows of items, some with workspaces, edited as in any
	 * outliner, and dragged to other places: the sidebar's folders and workspaces (`root`:
	 * the item everything here is under, `null` for the whole outline). How a workspace's row
	 * looks is the caller's (`workspace`).
	 */
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { dropTarget, type DropPlace } from '#lib/family.ts';
	import { contextMenu, type MenuItem } from '#lib/ui/menu.svelte.ts';
	import OutlineItemRow from './OutlineItemRow.svelte';
	import { addItem, editItem, moveItem, removeItem } from '../../routes/workspaces.remote';

	let {
		rows,
		folded,
		root = null,
		truncate = false,
		live,
		workspace,
		workspaceMenu,
		draggable = () => true,
		home = 'Outline',
		trail = [],
		back,
		onzoom,
		zoomable = () => true
	}: {
		rows: Row[];
		folded: { current: string[] };
		root?: string | null;
		/** Whether a long line is cut short, as in the sidebar; else it wraps. */
		truncate?: boolean;
		/** Whether a workspace's item has its workspace in use; else it is an archived one's record. */
		live: (id: string) => boolean;
		workspace: Snippet<[WorkspaceRowProps]>;
		/** What a workspace's menu offers; `zoom` where it can be zoomed into. */
		workspaceMenu?: (entry: Entry, actions: { zoom?: () => void }) => MenuItem[];
		/** Whether a workspace's row can be picked up (not one on its way out, say). */
		draggable?: (id: string) => boolean;
		/** What the top of this outline is called: where zooming out of the last level goes. */
		home?: string;
		/** The way down to the item zoomed into, itself last; empty while not zoomed. */
		trail?: { id: string; text: string }[];
		/**
		 * What the back arrow of a zoomed outline does: go back to where it was zoomed into
		 * before (`text` names it); where that isn't known, it goes one level up.
		 */
		back?: { text: string; go: () => void };
		/** Zooms into an item (FDR-019), or out to the top (`null`); no zooming without it. */
		onzoom?: (id: string | null) => void;
		/** Whether an entry can be zoomed into. */
		zoomable?: (entry: Entry) => boolean;
	} = $props();

	/** Zooms into a row's item, and puts the cursor on the first row under it. */
	function zoomIn(entry: Entry) {
		if (!onzoom || !zoomable(entry)) return;
		onzoom(entry.id);
		void tick().then(() => focusRow(rows[0]?.workspace.id ?? null));
	}
	/** Zooms out to `to` (the top, where `null`), and puts the cursor on where it was. */
	function zoomOut(to: string | null) {
		const from = trail.at(-1)?.id ?? null;
		if (!onzoom || !from) return;
		onzoom(to);
		void tick().then(() => focusRow(from));
	}
	/** Whether Cmd (Ctrl elsewhere) is held: a click on a row then zooms into it, and the cursor says so. */
	let zoomKey = $state(false);
	const isZoomKey = (event: KeyboardEvent | MouseEvent) =>
		/Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey;
	/** Zooms one level out. */
	const zoomUp = () => zoomOut(trail.at(-2)?.id ?? null);
	const canZoom = (entry: Entry) => !!onzoom && zoomable(entry);

	/** Whether a row is a workspace's: no folder is put under one, where only its child agents are. */
	const isWorkspace = (id: string | null) =>
		rows.some(({ workspace }) => workspace.id === id && workspace.workspace);

	const motion = () => ({ duration: prefersReducedMotion.current ? 0 : MOTION, easing: cubicOut });

	/**
	 * The item being dragged to another place (FDR-016, FDR-019), and where it would go: above
	 * a row, onto it (under that item) or below it, or below the last row. What is under it goes
	 * along; the workspaces among that report to the workspace of the nearest item above them.
	 */
	let dragged = $state<Entry | null>(null);
	let dropAt = $state<ReturnType<typeof dropTarget<Entry>>>(undefined);

	/**
	 * How deep the pointer is in the list: one level for each indent from its left edge.
	 * Where a gap between rows allows more than one depth, this picks it.
	 */
	function depthAt(event: DragEvent) {
		// from where rows begin: after the gutter their folds sit in
		const left =
			(list?.getBoundingClientRect().left ?? 0) +
			parseFloat(list ? getComputedStyle(list).paddingLeft : '0');
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
		const target = dropTarget(rows, dragged, place, true);
		// a folder stays out from under a workspace's row
		dropAt =
			target && !dragged.workspace && target.reparents && isWorkspace(target.parentId)
				? undefined
				: target;
		if (event.dataTransfer) event.dataTransfer.dropEffect = dropAt ? 'move' : 'none';
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		if (dragged && dropAt) {
			const { before, parentId, reparents } = dropAt;
			void moveItem({
				itemId: dragged.id,
				before,
				...(reparents && { parentId: parentId ?? root })
			});
		}
		endDrag();
	}

	function endDrag() {
		dragged = null;
		dropAt = undefined;
	}

	// --- Editing, as in any outliner -------------------------------------------------------

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
	/** The item a row is under: the row's above it, or what the whole list is under. */
	const parentOf = (index: number) => idAt(parentIndex(index)) ?? root;

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
	/** Puts the cursor in a row: in its line, at its `start` or (by default) its end. */
	function focusRow(id: string | null, at: 'start' | 'end' = 'end') {
		if (!id) return;
		const row = list?.querySelector(`[data-row="${CSS.escape(id)}"]`);
		const target = row?.querySelector<HTMLElement>('textarea, a[href], [data-row-focus]');
		target?.focus();
		if (target instanceof HTMLTextAreaElement) {
			const edge = at === 'start' ? 0 : target.value.length;
			target.setSelectionRange(edge, edge);
		}
	}
	const unfold = (id: string) => (folded.current = folded.current.filter((other) => other !== id));
	const toggleFolded = (id: string) =>
		(folded.current = folded.current.includes(id)
			? folded.current.filter((other) => other !== id)
			: [...folded.current, id]);

	/** Writes a new, empty item and puts the cursor in it. */
	async function newItem(parentId: string | null, before: string | null) {
		if (parentId) unfold(parentId);
		const id = await addItem({ parentId, before, text: '' });
		focusing = { id, ready: () => true };
	}
	/** Adds an item under a row, as its first. */
	const addUnder = (index: number) =>
		newItem(idAt(index), rows[index + 1]?.depth > rows[index].depth ? idAt(index + 1) : null);

	/** Moves the item, and keeps the cursor in it once it is where it was moved. */
	async function moveKeeping(entry: Entry, before: string | null, parentId?: string | null) {
		await moveItem({ itemId: entry.id, before, ...(parentId !== undefined && { parentId }) });
		const under = parentId === undefined ? entry.parentId : parentId;
		focusing = {
			id: entry.id,
			ready: (index) => parentOf(index) === under && idAt(siblingIndex(index, 1)) === before
		};
	}

	/** What the keys do in an item's line, as in any outliner. */
	async function itemKeys(
		event: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
		index: number
	) {
		const entry = rows[index].workspace;
		const input = event.currentTarget;
		const text = input.value;
		const save = () => (text !== entry.text ? editItem({ itemId: entry.id, text }) : undefined);
		const mod = event.metaKey || event.ctrlKey;
		if (event.key === 'Enter' && !mod && !event.altKey) {
			event.preventDefault();
			await save();
			await newItem(parentOf(index), idAt(siblingIndex(index, 1)));
		} else if (event.key === 'Tab' && !event.shiftKey) {
			event.preventDefault();
			const above = siblingIndex(index, -1);
			// not under a workspace: only its child agents are there
			if (above === -1 || rows[above].workspace.workspace) return;
			await save();
			unfold(idAt(above)!);
			await moveKeeping(entry, null, idAt(above));
		} else if (event.key === 'Tab') {
			event.preventDefault();
			const parent = parentIndex(index);
			if (parent === -1) return;
			await save();
			await moveKeeping(entry, idAt(siblingIndex(parent, 1)), parentOf(parent));
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
			!entry.note &&
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
		// zooming: Cmd-. (Ctrl-. elsewhere) into the row, with Shift out of where it is
		if ((event.metaKey || event.ctrlKey) && !event.altKey && event.code === 'Period') {
			event.preventDefault();
			if (event.shiftKey) zoomUp();
			else zoomIn(rows[index].workspace);
			return;
		}
		if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
		const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (!step || !rows[index + step]) return;
		// in a line that wraps, up and down go through it first: on from its start or its end
		const field = event.target;
		if (field instanceof HTMLTextAreaElement && wraps(field)) {
			const edge = step === -1 ? 0 : field.value.length;
			if (field.selectionStart !== edge || field.selectionEnd !== edge) return;
		}
		event.preventDefault();
		// into a line from above, at its start; from below, at its end: on through it from there
		focusRow(idAt(index + step), step === 1 ? 'start' : 'end');
	}

	/** Whether a line's text takes more than one line on screen. */
	function wraps(field: HTMLTextAreaElement) {
		const style = getComputedStyle(field);
		const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
		return field.clientHeight - padding > parseFloat(style.lineHeight) * 1.5;
	}

	/** The items' rows, by item: to go into the note of one. */
	const itemRows: Record<string, OutlineItemRow | undefined> = $state({});

	/** What can be done with an item without a workspace. */
	function itemMenu(entry: Entry, index: number): MenuItem[] {
		return [
			{
				label: 'Add a folder under it',
				icon: 'icon-[lucide--list-plus]',
				onselect: () => addUnder(index)
			},
			{
				label: entry.note ? 'Edit its note' : 'Add a note',
				icon: 'icon-[lucide--text]',
				keys: ['shift', 'enter'],
				onselect: () => void itemRows[entry.id]?.editNote()
			},
			...(canZoom(entry)
				? [
						{
							label: 'Zoom in',
							icon: 'icon-[lucide--zoom-in]',
							keys: ['cmd', '.'],
							onselect: () => zoomIn(entry)
						}
					]
				: []),
			'separator' as const,
			{
				label: 'Remove',
				icon: 'icon-[lucide--trash-2]',
				tone: 'danger' as const,
				onselect: () => removeItem({ itemId: entry.id })
			}
		];
	}

	/**
	 * How far a row sits in from the item it is under: its sign under the title above (a
	 * row's label padding, its sign, and the gap after it, less where a repository's smaller
	 * picture sits in its sign's place).
	 */
	const INDENT = 6.5;
	/** How long rows take to slide away or back, in milliseconds. */
	const MOTION = 200;
</script>

<!-- whether Cmd (Ctrl) is held, for the cursor; let go when the window is left, too -->
<svelte:window
	onkeydown={(event) => (zoomKey = isZoomKey(event))}
	onkeyup={(event) => (zoomKey = isZoomKey(event))}
	onblur={() => (zoomKey = false)}
/>

{#if trail.length}
	{@const zoomed = trail.at(-1)!}
	{@const up = trail.at(-2)}
	{@const to = back ?? {
		text: up ? up.text || 'Untitled' : home,
		go: () => zoomOut(up?.id ?? null)
	}}
	{@const path = [home, ...trail.map((crumb) => crumb.text || 'Untitled')].join(' › ')}
	<!-- zoomed into an item: it is the first row, what is under it is under it, and its sign leads back up -->
	<!-- its arrow sits in the gutter, where the rows' folds are; its title above their signs -->
	<div class="item gap-1.5 pr-1 text-base text-ink" title={path}>
		<button
			type="button"
			class="mt-1 grid h-6 w-5 shrink-0 place-items-center self-start rounded-control text-muted hover:text-ink"
			aria-label={`Back to ${to.text}`}
			title={`Back to ${to.text}`}
			onclick={to.go}
		>
			<span aria-hidden="true" class="icon-[lucide--arrow-left] size-4"></span>
		</button>
		<h2 class="min-w-0 flex-1 py-1 font-semibold break-words">{zoomed.text || 'Untitled'}</h2>
	</div>
{/if}
<!-- a gutter at the left, where a row's fold sits beside its sign, as in Workflowy -->
<ul
	class="space-y-px pb-4 pl-5"
	bind:this={list}
	ondragover={overList}
	ondrop={drop}
	ondragleave={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dropAt = undefined;
	}}
>
	{#each rows as { workspace: entry, parent, depth, under }, index (entry.id)}
		{@const isFolded = under > 0 && folded.current.includes(entry.id)}
		{@const fold =
			under > 0
				? { count: under, folded: isFolded, toggle: () => toggleFolded(entry.id) }
				: undefined}
		{@const dropping = dropAt && dropAt.line.id === entry.id ? dropAt.line.edge : null}
		<!-- an archived workspace's item: a done line, which stays where it is -->
		{@const archived = entry.workspace && !live(entry.id)}
		{@const canDrag = !archived && (!entry.workspace || draggable(entry.id))}
		<!-- one sits a little in from the item it is under; a drop shows as a line above or below it, or lights it up -->
		<!-- up and down go from row to row: the keys of what is focused in it, a link or a line -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<li
			data-row={entry.id}
			style:margin-inline-start="calc(var(--spacing) * {INDENT * depth})"
			style:--drop-indent={dropping && dropAt
				? `calc(var(--spacing) * ${INDENT * (dropAt.line.depth - depth)})`
				: undefined}
			class={[
				'group/row relative',
				zoomKey && !(entry.workspace && !live(entry.id)) && canZoom(entry) && 'zoomable',
				dropping === 'above' && 'row-drop-before',
				dropping === 'below' && 'row-drop-after'
			]}
			transition:slide={motion()}
			{@attach contextMenu(() =>
				!canDrag
					? []
					: entry.workspace
						? (workspaceMenu?.(entry, {
								zoom: canZoom(entry) ? () => zoomIn(entry) : undefined
							}) ?? [])
						: itemMenu(entry, index)
			)}
			draggable={canDrag}
			onkeydown={(event) => rowKeys(event, index)}
			ondragstart={(event) => {
				dragged = entry;
				event.dataTransfer?.setData('text/plain', entry.text);
				if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
			}}
			ondragend={endDrag}
			onclickcapture={(event) => {
				// Cmd-click (Ctrl-click elsewhere: on a Mac that is the menu) zooms into it, as in
				// Workflowy; not on what the row has to click besides (its sign, its fold)
				if (!isZoomKey(event) || !canZoom(entry) || archived) return;
				if (event.target instanceof Element && event.target.closest('button')) return;
				event.preventDefault();
				event.stopPropagation();
				zoomIn(entry);
			}}
		>
			<!-- in the gutter beside its sign, as in Workflowy: what folds what is under it -->
			{#if fold}
				<button
					type="button"
					class="absolute top-1 right-full grid h-6 w-5 place-items-center rounded-control text-faint hover:text-ink"
					aria-label={`${fold.folded ? 'Expand' : 'Collapse'} ${entry.text || 'item'}`}
					aria-expanded={!fold.folded}
					title={`${fold.folded ? 'Expand' : 'Collapse'} ${entry.text || 'item'}`}
					onclick={fold.toggle}
				>
					<span
						aria-hidden="true"
						class={[
							'icon-[lucide--chevron-right] size-4 transition-transform motion-reduce:transition-none',
							!fold.folded && 'rotate-90'
						]}
					></span>
				</button>
			{/if}
			{#if entry.workspace && !archived}
				{@render workspace({
					entry,
					parent,
					under,
					fold,
					isFolded,
					dragging: dragged?.id === entry.id,
					target: dropping === 'onto'
				})}
			{:else}
				<OutlineItemRow
					bind:this={itemRows[entry.id]}
					id={entry.id}
					text={entry.text}
					note={archived ? undefined : entry.note}
					{truncate}
					href={archived ? resolve('/workspaces/[id]', { id: entry.id }) : undefined}
					dragging={dragged?.id === entry.id}
					highlighted={dropping === 'onto'}
					{fold}
					onsave={(text) => editItem({ itemId: entry.id, text })}
					onnote={(note) => editItem({ itemId: entry.id, note })}
					onkeydown={(event) => itemKeys(event, index)}
				/>
			{/if}
		</li>
	{/each}
	<!-- the outline's last line: where something new is written (FDR-019) -->
	<li>
		<button
			type="button"
			class="item w-full gap-1 px-1 text-base text-faint"
			onclick={() => newItem(root, null)}
		>
			<span class="grid size-6 shrink-0 place-items-center">
				<span class="icon-[lucide--plus] size-4"></span>
			</span>
			<span class="py-1">New folder</span>
		</button>
	</li>
</ul>
