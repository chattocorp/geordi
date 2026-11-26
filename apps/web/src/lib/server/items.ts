/**
 * The outline (FDR-017, ADR-016): a tree of items, each a line of text, some with a
 * workspace attached. A workspace's item has the workspace's ID, and its text is the
 * workspace's name: kept on the workspace, where agents and people rename it. Items
 * without a workspace have their own events, below; a workspace's item moves with
 * `workspace.moved` and comes into being with `workspace.created` (so workspaces from
 * before the outline have items without anything translated).
 *
 * Pure: the workspaces' projection keeps the outline, because who supervises whom is
 * derived from it (`workspaceAbove`).
 */

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

/** Puts `id` right above `before` in the order, or last where that is `null` (or gone). */
function place(outline: Outline, id: string, before: string | null) {
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
 * that has one (FDR-017). Items without a workspace pass authority through.
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
