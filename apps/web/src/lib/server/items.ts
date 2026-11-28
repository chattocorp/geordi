/**
 * The outline (FDR-019, ADR-016): a tree of items, each a line of text, some with a
 * workspace attached. What an item without one is follows from where it is (`isTodo`): a
 * todo under a workspace, which can be ticked off; a folder anywhere else, which can't. A workspace's item has the workspace's ID, and its text is the
 * workspace's name: kept on the workspace, where agents and people rename it. Items
 * without a workspace have their own events, below; a workspace's item moves with
 * `workspace.moved` and comes into being with `workspace.created` (so workspaces from
 * before the outline have items without anything translated).
 *
 * Pure: the workspaces' projection keeps the outline, because who supervises whom is
 * derived from it (`workspaceAbove`).
 */

import { INBOX } from '#lib/family.ts';

type ItemStream = `item:${string}`;

export type ItemEvent =
	/** A person (or, later, an agent) wrote a new item: under `parentId`, right above `before`, or last. */
	| {
			type: 'item.created';
			stream: ItemStream;
			data: { id: string; parentId: string | null; before: string | null; text: string };
	  }
	| {
			type: 'item.edited';
			stream: ItemStream;
			data: { id: string; text?: string; note?: string };
	  }
	| {
			type: 'item.moved';
			stream: ItemStream;
			data: { id: string; parentId: string | null; before: string | null };
	  }
	| { type: 'item.completed'; stream: ItemStream; data: { id: string } }
	| { type: 'item.reopened'; stream: ItemStream; data: { id: string } }
	/** Removed, with everything under it: none of it has a workspace. */
	| { type: 'item.deleted'; stream: ItemStream; data: { id: string } };

export type Item = {
	id: string;
	/** The item it is under; `null` at the top. */
	parentId: string | null;
	/** Its text; `''` for a workspace's item, whose text is the workspace's name. */
	text: string;
	note: string;
	/** Ticked off. A workspace's item is done when the workspace is archived. */
	done: boolean;
	/** Whether a workspace is attached: the one with this item's ID. */
	workspace: boolean;
};

/** The items, by ID, and their order top to bottom: siblings are in the order they have here. */
export type Outline = { items: Map<string, Item>; order: string[] };

export const emptyOutline = (): Outline => ({ items: new Map(), order: [] });

/**
 * Puts `id` right above `before` in the order, or last where that is `null`. Where `before`
 * is gone, a new item goes last and one already there stays where it is, as workspaces
 * always have.
 */
function place(outline: Outline, id: string, before: string | null) {
	const there = outline.order.includes(id);
	if (before !== null && !outline.order.includes(before) && there) return;
	const order = outline.order.filter((other) => other !== id);
	const at = before === null ? -1 : order.indexOf(before);
	order.splice(at === -1 ? order.length : at, 0, id);
	outline.order = order;
}

/** Everything under the item, at any depth (not the item itself). */
export function descendantsOf(outline: Outline, id: string): Item[] {
	const children = [...outline.items.values()].filter((item) => item.parentId === id);
	return children.flatMap((child) => [child, ...descendantsOf(outline, child.id)]);
}

/**
 * The workspace a workspace (or any item) reports to: the one of the nearest item above it
 * that has one (FDR-019). Items without a workspace pass authority through.
 */
export function workspaceAbove(outline: Outline, id: string): string | null {
	const seen = new Set<string>();
	let parent = outline.items.get(id)?.parentId;
	while (parent && !seen.has(parent)) {
		seen.add(parent);
		const item = outline.items.get(parent);
		if (!item) return null;
		if (item.workspace) return item.id;
		parent = item.parentId;
	}
	return null;
}

/** Whether an item is a todo (FDR-019): one without a workspace, under one that has one. Else it is a folder. */
export function isTodo(outline: Outline, id: string): boolean {
	return !outline.items.get(id)?.workspace && workspaceAbove(outline, id) !== null;
}

/**
 * The workspaces whose supervisor follows this item when it moves: itself, if it has one;
 * else the nearest workspaces under it, with nothing but items between.
 */
export function frontierOf(outline: Outline, id: string): string[] {
	const item = outline.items.get(id);
	if (!item) return [];
	if (item.workspace) return [id];
	return [...outline.items.values()]
		.filter((child) => child.parentId === id)
		.flatMap((child) => frontierOf(outline, child.id));
}

/** A workspace came to be: its item, new at the top (newest first), or one written down for it. */
export function attach(outline: Outline, id: string, parentId: string | null) {
	const item = outline.items.get(id);
	if (item) {
		item.workspace = true;
		item.text = '';
		return;
	}
	outline.items.set(id, { id, parentId, text: '', note: '', done: false, workspace: true });
	outline.order = [id, ...outline.order];
}

/** Moves an item (with what is under it): under `parentId` where given, right above `before`. */
export function move(
	outline: Outline,
	id: string,
	before: string | null,
	parentId?: string | null
) {
	const item = outline.items.get(id);
	if (!item || id === before) return;
	if (parentId !== undefined) item.parentId = parentId;
	place(outline, id, before);
}

/** Applies an item's own event. */
export function applyItem(outline: Outline, event: ItemEvent) {
	const { data } = event;
	if (event.type === 'item.created') {
		const { id, parentId, before, text } = event.data;
		outline.items.set(id, { id, parentId, text, note: '', done: false, workspace: false });
		place(outline, id, before);
		return;
	}
	const item = outline.items.get(data.id);
	if (!item) return;
	switch (event.type) {
		case 'item.edited':
			if (event.data.text !== undefined) item.text = event.data.text;
			if (event.data.note !== undefined) item.note = event.data.note;
			break;
		case 'item.moved':
			move(outline, item.id, event.data.before, event.data.parentId);
			break;
		case 'item.completed':
		case 'item.reopened':
			item.done = event.type === 'item.completed';
			break;
		case 'item.deleted':
			remove(outline, [item.id, ...descendantsOf(outline, item.id).map(({ id }) => id)]);
			break;
	}
}

/** Takes items out of the outline. */
export function remove(outline: Outline, ids: string[]) {
	const gone = new Set(ids);
	for (const id of gone) outline.items.delete(id);
	outline.order = outline.order.filter((id) => !gone.has(id));
}

/** What the outline needs to know of the workspace attached to an item. */
export type Attached = { title: string; worktreeId: string; archivedAt: string | null };

/**
 * The outline as people see it (FDR-019), top to bottom: each item with the item it is
 * under, its text (a workspace's name), whether it is a todo, and whether it is done (a
 * todo: ticked off; a workspace: archived; a folder never is).
 *
 * An archived workspace's item stays as a record only within a tree still in use: under an
 * item without a workspace, or under a workspace in use. An archived tree leaves the
 * outline with what is under it, as archived workspaces always have (they are in the
 * archive); a workspace in use there is listed at the top. An agent working in another
 * workspace's directory is no item of its own (`ownerOf` says whose it is), and what it
 * started is under that workspace.
 *
 * The Inbox comes first: a place, not an item (`INBOX`), listed as an entry so that what is
 * in it has something to be under. Nothing is above what is in it, so an archived workspace
 * leaves it, as it leaves the top.
 */
export function outlineView(
	outline: Outline,
	attached: (id: string) => Attached | undefined,
	ownerOf: (id: string) => string | undefined
) {
	const { items, order } = outline;
	const archived = (item: Item) => item.workspace && !!attached(item.id)?.archivedAt;
	const above = (item: Item): Item[] => {
		const line: Item[] = [];
		const seen = new Set([item.id]);
		let parent = item.parentId ? items.get(item.parentId) : undefined;
		while (parent && !seen.has(parent.id)) {
			seen.add(parent.id);
			line.push(parent);
			parent = parent.parentId ? items.get(parent.parentId) : undefined;
		}
		return line;
	};
	const away = new Map<string, boolean>();
	/** An archived workspace's item with nothing in use above it: an archived tree's top. */
	const archivedTop = (item: Item) => {
		let known = away.get(item.id);
		if (known === undefined) {
			known = archived(item) && above(item).every(archived);
			away.set(item.id, known);
		}
		return known;
	};
	const inbox = {
		id: INBOX,
		parentId: null,
		text: 'Inbox',
		note: '',
		done: false,
		workspace: false,
		todo: false
	};
	const listed = order.flatMap((id) => {
		const item = items.get(id)!;
		const workspace = item.workspace ? attached(id) : undefined;
		if (item.workspace && (!workspace || workspace.worktreeId !== id)) return [];
		const gone = archivedTop(item) || above(item).some(archivedTop);
		if (gone && (!workspace || workspace.archivedAt)) return [];
		const todo = isTodo(outline, id);
		const parentId = gone ? null : item.parentId && (ownerOf(item.parentId) ?? item.parentId);
		return [
			{
				id,
				parentId: parentId || null,
				text: workspace?.title ?? item.text,
				note: item.note,
				done: workspace ? !!workspace.archivedAt : todo && item.done,
				workspace: !!workspace,
				todo
			}
		];
	});
	return [inbox, ...listed];
}

/** An entry of a workspace's scope (FDR-019): its own item, or a child workspace's. */
export type ScopeEntry = Item & {
	/** How deep under the workspace: 0 for what is right under it. */
	depth: number;
};

/**
 * A workspace's scope (FDR-019), in outline order: the items under its item, down to the
 * next items with workspaces of their own, which are listed (as its child agents) but not
 * gone into.
 */
export function scopeOf(outline: Outline, id: string): ScopeEntry[] {
	const childrenOf = Map.groupBy(
		outline.order.map((each) => outline.items.get(each)!),
		(item) => item.parentId
	);
	const entries: ScopeEntry[] = [];
	const walk = (parent: string, depth: number) => {
		for (const item of childrenOf.get(parent) ?? []) {
			entries.push({ ...item, depth });
			if (!item.workspace) walk(item.id, depth + 1);
		}
	};
	walk(id, 0);
	return entries;
}

/** Whether an item is in a workspace's scope: under its item, with no other workspace between. */
export function inScope(outline: Outline, workspace: string, id: string): boolean {
	const seen = new Set<string>();
	let parent = outline.items.get(id)?.parentId;
	while (parent && !seen.has(parent)) {
		if (parent === workspace) return true;
		seen.add(parent);
		const item = outline.items.get(parent);
		if (!item || item.workspace) return false;
		parent = item.parentId;
	}
	return false;
}

/** The items above one, from the top down. */
export function pathOf(outline: Outline, id: string): Item[] {
	const line: Item[] = [];
	const seen = new Set<string>([id]);
	let parent = outline.items.get(id)?.parentId;
	while (parent && !seen.has(parent)) {
		seen.add(parent);
		const item = outline.items.get(parent);
		if (!item) break;
		line.unshift(item);
		parent = item.parentId;
	}
	return line;
}
