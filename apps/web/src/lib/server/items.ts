/**
 * The outline (FDR-019, ADR-016): a tree of items, each a line of text, some with a
 * workspace attached. An item without one is a folder, which groups workspaces. A
 * workspace's item has the workspace's ID, and its text is the workspace's name: kept on the workspace, where agents and people rename it. Items
 * without a workspace have their own events, below; a workspace's item moves with
 * `workspace.moved` and comes into being with `workspace.created` (so workspaces from
 * before the outline have items without anything translated).
 *
 * Pure: the workspaces' projection keeps the outline, because who supervises whom is
 * derived from it (`workspaceAbove`).
 */

/**
 * What the Inbox was (FDR-019): a place at the top that new workspaces landed in, recorded
 * as a parent. It is gone, and what was put there is at the top.
 */
const INBOX = 'inbox';
const atTop = (parentId: string | null) => (parentId === INBOX ? null : parentId);

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
	/** From when a workspace had todos, which were ticked off: read, and nothing follows. */
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

/**
 * Whether an item is one of a workspace's own (FDR-019): one without a workspace, under one
 * that has one. Those were its todos, which are gone: none is written any more, and the
 * outline leaves out what is left of them.
 */
export function underWorkspace(outline: Outline, id: string): boolean {
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

/**
 * A workspace came to be: its item, new at the top (newest first). One could once be
 * started on an item written down for it, which it then took: events from then are read so.
 */
export function attach(outline: Outline, id: string, parentId: string | null) {
	const item = outline.items.get(id);
	if (item) {
		item.workspace = true;
		item.text = '';
		return;
	}
	outline.items.set(id, {
		id,
		parentId: atTop(parentId),
		text: '',
		note: '',
		workspace: true
	});
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
	if (parentId !== undefined) item.parentId = atTop(parentId);
	place(outline, id, before);
}

/** Applies an item's own event. */
export function applyItem(outline: Outline, event: ItemEvent) {
	const { data } = event;
	if (event.type === 'item.created') {
		const { id, parentId, before, text } = event.data;
		outline.items.set(id, {
			id,
			parentId: atTop(parentId),
			text,
			note: '',
			workspace: false
		});
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
 * under, its text (a workspace's name), and whether it is done (a workspace: archived; a
 * folder never is). What is left of a workspace's todos is left out, and a workspace filed
 * under one of them is right under the workspace that supervises it.
 *
 * An archived workspace's item stays as a record only within a tree still in use: under an
 * item without a workspace, or under a workspace in use. An archived tree leaves the
 * outline with what is under it, as archived workspaces always have (they are in the
 * archive); a workspace in use there is listed at the top. An agent working in another
 * workspace's directory is no item of its own (`ownerOf` says whose it is), and what it
 * started is under that workspace.
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
	return order.flatMap((id) => {
		const item = items.get(id)!;
		const workspace = item.workspace ? attached(id) : undefined;
		if (item.workspace && (!workspace || workspace.worktreeId !== id)) return [];
		const gone = archivedTop(item) || above(item).some(archivedTop);
		if (gone && (!workspace || workspace.archivedAt)) return [];
		if (underWorkspace(outline, id)) return [];
		const under =
			item.parentId && underWorkspace(outline, item.parentId)
				? workspaceAbove(outline, id)
				: item.parentId;
		const parentId = gone ? null : under && (ownerOf(under) ?? under);
		return [
			{
				id,
				parentId: parentId || null,
				text: workspace?.title ?? item.text,
				note: item.note,
				done: !!workspace?.archivedAt,
				workspace: !!workspace
			}
		];
	});
}
