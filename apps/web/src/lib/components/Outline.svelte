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
		/** Adds an item under it, and puts the cursor there. */
		add: () => void;
		/** Zooms into it, where it can be. */
		zoom?: () => void;
	};
</script>

<script lang="ts">
	/**
	 * The outline editor (FDR-019): rows of items, some with workspaces, edited as in any
	 * outliner, and dragged to other places. The sidebar shows the whole outline with it; a
	 * workspace's Plan window its scope (`root`: the item everything here is under, `null` for
	 * the whole outline). How a workspace's row looks is the caller's (`workspace`).
	 */
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { dropTarget, type DropPlace } from '#lib/family.ts';
	import { contextMenu, type MenuItem } from '#lib/ui/menu.svelte.ts';
	import OutlineItemRow from './OutlineItemRow.svelte';
	import {
		addItem,
		completeItem,
		editItem,
		moveItem,
		removeItem
	} from '../../routes/workspaces.remote';

	let {
		rows,
		folded,
		root = null,
		live,
		workspace,
		workspaceMenu,
		draggable = () => true,
		pointedAt = null,
		home = 'Outline',
		trail = [],
		onzoom,
		zoomable = () => true
	}: {
		rows: Row[];
		folded: { current: string[] };
		root?: string | null;
		/** Whether a workspace's item has its workspace in use; else it is an archived one's record. */
		live: (id: string) => boolean;
		workspace: Snippet<[WorkspaceRowProps]>;
		/** What a workspace's menu offers; `zoom` where it can be zoomed into. */
		workspaceMenu?: (entry: Entry, actions: { add: () => void; zoom?: () => void }) => MenuItem[];
		/** Whether a workspace's row can be picked up (not one on its way out, say). */
		draggable?: (id: string) => boolean;
		/** An item lit up from elsewhere (a workspace's parent, pointed at). */
		pointedAt?: string | null;
		/** What the top of this outline is called: where zooming out of the last level goes. */
		home?: string;
		/** The way down to the item zoomed into, itself last; empty while not zoomed. */
		trail?: { id: string; text: string }[];
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
	/** Zooms one level out. */
	const zoomUp = () => zoomOut(trail.at(-2)?.id ?? null);
	const canZoom = (entry: Entry) => !!onzoom && zoomable(entry);

	/** Ticks an item off, or not: it stays where it is, crossed out. */
	const tickOff = (entry: { id: string; done: boolean }) =>
		completeItem({ itemId: entry.id, done: !entry.done });

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
	function focusRow(id: string | null) {
		if (!id) return;
		const row = list?.querySelector(`[data-row="${CSS.escape(id)}"]`);
		row?.querySelector<HTMLElement>('input, a[href]')?.focus();
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
			await newItem(parentOf(index), idAt(siblingIndex(index, 1)));
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
		event.preventDefault();
		focusRow(idAt(index + step));
	}

	/** What can be done with an item without a workspace. */
	function itemMenu(entry: Entry, index: number): MenuItem[] {
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
				onselect: () => addUnder(index)
			},
			...(canZoom(entry)
				? [{ label: 'Zoom in', icon: 'icon-[lucide--zoom-in]', onselect: () => zoomIn(entry) }]
				: []),
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

	/**
	 * How far a row sits in from the item it is under: its sign under the title above (a
	 * row's label padding, its sign, and the gap after it, less where a repository's smaller
	 * picture sits in its sign's place).
	 */
	const INDENT = 6.5;
	/** How long rows take to slide away or back, in milliseconds. */
	const MOTION = 200;
</script>

{#if trail.length}
	{@const zoomed = trail.at(-1)!}
	{@const up = trail.at(-2)}
	{@const path = [home, ...trail.map((crumb) => crumb.text || 'Untitled')].join(' › ')}
	<!-- zoomed into an item: it is the first row, what is under it is under it, and its sign leads back up -->
	<div class="item gap-1 px-1 text-base text-ink" title={path}>
		<button
			type="button"
			class="grid size-6 shrink-0 place-items-center rounded-control text-muted hover:text-ink"
			aria-label={`Zoom out to ${up ? up.text || 'Untitled' : home}`}
			title={`Zoom out to ${up ? up.text || 'Untitled' : home}`}
			onclick={() => zoomOut(up?.id ?? null)}
		>
			<span aria-hidden="true" class="icon-[lucide--arrow-left] size-4"></span>
		</button>
		<h2 class="min-w-0 flex-1 truncate py-1 font-semibold">{zoomed.text || 'Untitled'}</h2>
	</div>
{/if}
<ul
	class="space-y-px pb-4"
	style:margin-inline-start={trail.length ? `calc(var(--spacing) * ${INDENT})` : undefined}
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
			class={[dropping === 'above' && 'row-drop-before', dropping === 'below' && 'row-drop-after']}
			transition:slide={motion()}
			{@attach contextMenu(() =>
				!canDrag
					? []
					: entry.workspace
						? (workspaceMenu?.(entry, {
								add: () => addUnder(index),
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
		>
			{#if entry.workspace && !archived}
				{@render workspace({
					entry,
					parent,
					under,
					fold,
					isFolded,
					dragging: dragged?.id === entry.id,
					target: dropping === 'onto',
					add: () => newItem(entry.id, null),
					zoom: canZoom(entry) ? () => zoomIn(entry) : undefined
				})}
			{:else}
				<OutlineItemRow
					id={entry.id}
					text={entry.text}
					done={entry.done}
					href={archived ? resolve('/workspaces/[id]', { id: entry.id }) : undefined}
					dragging={dragged?.id === entry.id}
					highlighted={pointedAt === entry.id || dropping === 'onto'}
					{fold}
					onsave={(text) => editItem({ itemId: entry.id, text })}
					ontoggle={() => tickOff(entry)}
					onadd={archived ? undefined : () => newItem(entry.id, null)}
					onremove={archived ? undefined : () => removeItem({ itemId: entry.id })}
					onzoom={!archived && canZoom(entry) ? () => zoomIn(entry) : undefined}
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
			<span class="py-1">New item</span>
		</button>
	</li>
</ul>
