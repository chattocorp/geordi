/**
 * The outline as the sidebar shows it (FDR-016, FDR-019): items, each right after the one it
 * is under, some of them workspaces. `workspace` is a listed row's item (or workspace).
 */

export type Listed<T> = {
	workspace: T;
	/** The workspace this one reports to, if it is listed: above it, or elsewhere (a project). */
	parent: T | null;
	/** How many listed ancestors it has: 0 for one that stands at the top. */
	depth: number;
};

/** The workspace and those that started it, nearest first; stops at one gone, or at a loop. */
export function lineOf<T extends { parentId: string | null }>(
	byId: Map<string, T>,
	id: string | null
): T[] {
	const line: T[] = [];
	let w = id ? byId.get(id) : undefined;
	while (w && !line.includes(w)) {
		line.push(w);
		w = w.parentId ? byId.get(w.parentId) : undefined;
	}
	return line;
}

/**
 * Whether a workspace is put aside: marked inactive itself, or started by one that is, at
 * any depth. `inactive` on each is whether a person marked that one; an archived one is
 * as good as gone.
 */
export function isInactive<
	T extends { parentId: string | null; inactive?: boolean; archivedAt?: string | null }
>(byId: Map<string, T>, id: string) {
	for (const each of lineOf(byId, id)) {
		if (each.archivedAt) return false;
		if (each.inactive) return true;
	}
	return false;
}

/**
 * The tree, top to bottom, in the order given: each item right after its parent, where that
 * is listed; else at the top.
 */
export function nested<T extends { id: string; parentId: string | null }>(all: T[]): Listed<T>[] {
	const byId = new Map(all.map((item) => [item.id, item]));
	const childrenOf = Map.groupBy(all, (item) =>
		item.parentId && byId.has(item.parentId) ? item.parentId : null
	);
	const listed: Listed<T>[] = [];
	const visited = new Set<string>();
	const list = (item: T, depth: number) => {
		if (visited.has(item.id)) return; // a cycle: list it once
		visited.add(item.id);
		listed.push({ workspace: item, parent: byId.get(item.parentId ?? '') ?? null, depth });
		for (const child of childrenOf.get(item.id) ?? []) list(child, depth + 1);
	};
	for (const item of childrenOf.get(null) ?? []) list(item, 0);
	// a loop has no root: list its members at the top, rather than not at all
	for (const item of all) list(item, 0);
	return listed;
}

/**
 * An agent that works in another workspace's directory (a reviewer, say) is no piece of
 * work of its own: it belongs to that workspace, and is shown in it. This sorts the
 * workspaces in use into those that stand for themselves, each with the agents working
 * alongside it (oldest first, given newest first). One whose workspace is no longer
 * around stands for itself.
 */
export function withAides<T extends { id: string; worktreeId: string }>(
	all: T[]
): { workspace: T; aides: T[] }[] {
	const ids = new Set(all.map((workspace) => workspace.id));
	const alongside = (workspace: T) =>
		workspace.worktreeId !== workspace.id && ids.has(workspace.worktreeId);
	return all
		.filter((workspace) => !alongside(workspace))
		.map((workspace) => ({
			workspace,
			aides: all.filter((other) => alongside(other) && other.worktreeId === workspace.id).reverse()
		}));
}

/**
 * The rows of a repository's list that show while the workspaces in `folded` have what
 * their agents started folded away under them; each with how many it has under it.
 */
export function unfolded<T extends { id: string }>(
	rows: Listed<T>[],
	folded: readonly string[]
): (Listed<T> & { under: number })[] {
	const shown: (Listed<T> & { under: number })[] = [];
	let hiddenBelow = Infinity; // rows deeper than this are folded away
	rows.forEach((row, index) => {
		if (row.depth > hiddenBelow) return;
		hiddenBelow = Infinity;
		let under = 0;
		while (rows[index + under + 1]?.depth > row.depth) under++;
		shown.push({ ...row, under });
		if (under > 0 && folded.includes(row.workspace.id)) hiddenBelow = row.depth;
	});
	return shown;
}

/** The workspace `step` places from `current` in `order`, round at the ends; from outside it, the first or last. */
export function stepThrough<T extends { id: string }>(
	order: T[],
	current: string | null,
	step: 1 | -1
): T | undefined {
	const at = order.findIndex(({ id }) => id === current);
	if (at === -1) return step === 1 ? order[0] : order.at(-1);
	return order[(at + step + order.length) % order.length];
}

/** Find the next unread row after the current one, wrapping once. */
export function nextUnread<T extends { id: string }>(
	order: T[],
	current: string | null,
	unread: ReadonlySet<string>
): T | undefined {
	const at = order.findIndex(({ id }) => id === current);
	const isUnread = (row: T) => unread.has(row.id);
	return order.slice(at + 1).find(isUnread) ?? order.slice(0, Math.max(0, at)).find(isUnread);
}

/**
 * Where something is dropped in the outline: onto a row (under it, last), or into the gap
 * after a row (`after`: its index; -1 for the gap above the first row) at a `depth`, which
 * is kept within what that gap allows.
 */
export type DropPlace = { onto: number } | { after: number; depth: number };

/** What shows where a drop would go: a line below (or above) a row, in at `depth`, or the row lit up. */
type Line = { id: string; edge: 'above' | 'below' | 'onto'; depth: number };

/**
 * The depths a gap between two rows allows (FDR-019): from that of the row below it (or the
 * top level, below the last row) to that of the row above it. Where the row below is the
 * first under the row above, only its depth.
 */
export function gapDepths(rows: { depth: number }[], after: number): [number, number] {
	const low = rows[after + 1]?.depth ?? 0;
	return [low, after < 0 ? low : Math.max(rows[after].depth, low)];
}

/**
 * Where a dragged item would go, dropped at `place` (FDR-016, FDR-019): under `parentId`,
 * right above `before` (`null`: after the last of its new siblings); `line` is what shows it.
 * `reparents` whether that changes its parent. Every gap between two rows is one place,
 * reached from the row above it or the row below it alike, so the line doesn't jump. Nothing
 * where it would stay where it is, or may not go: under itself, under or over a `project`,
 * or at the top unless `topLevel`.
 */
export function dropTarget<T extends { id: string; parentId: string | null; project?: boolean }>(
	rows: Listed<T>[],
	dragged: T,
	place: DropPlace,
	topLevel: boolean
): { parentId: string | null; before: string | null; reparents: boolean; line: Line } | undefined {
	const id = (index: number) => rows[index].workspace.id;
	/** The row's parent in this list: the nearest row above it that is less deep. */
	const parentAt = (index: number) => {
		for (let above = index - 1; above >= 0; above--)
			if (rows[above].depth < rows[index].depth) return id(above);
		return null;
	};
	/** The next row with the same parent, if any. */
	const nextSibling = (index: number) => {
		for (let below = index + 1; below < rows.length; below++) {
			if (rows[below].depth < rows[index].depth) return null;
			if (rows[below].depth === rows[index].depth) return id(below);
		}
		return null;
	};

	const from = rows.findIndex(({ workspace }) => workspace.id === dragged.id);
	let end = from;
	while (from !== -1 && rows[end + 1]?.depth > rows[from].depth) end++;
	/** Whether a row is the dragged one, or under it. */
	const inside = (index: number) => from !== -1 && index >= from && index <= end;

	let target: { parentId: string | null; before: string | null; line: Line };
	if ('onto' in place) {
		if (!rows[place.onto] || inside(place.onto)) return undefined;
		const { workspace, depth } = rows[place.onto];
		target = {
			parentId: workspace.id,
			before: null,
			line: { id: workspace.id, edge: 'onto', depth }
		};
	} else {
		const { after } = place;
		if (after >= rows.length || !rows.length) return undefined;
		// within what it moves, but not at its end: it can't be put between its own rows
		if (inside(after) && after !== end) return undefined;
		const [low, high] = gapDepths(rows, after);
		const depth = Math.min(high, Math.max(low, place.depth));
		let parent = -1;
		for (let above = after; above >= 0 && depth > 0; above--)
			if (rows[above].depth === depth - 1) {
				parent = above;
				break;
			}
		if (parent !== -1 && inside(parent)) return undefined;
		let next = after + 1;
		while (next < rows.length && rows[next].depth > depth) next++;
		target = {
			parentId: parent === -1 ? null : id(parent),
			before: rows[next]?.depth === depth ? id(next) : null,
			line:
				after < 0 ? { id: id(0), edge: 'above', depth } : { id: id(after), edge: 'below', depth }
		};
	}

	if (target.parentId === null && !topLevel) return undefined;
	const parent = rows.find(({ workspace }) => workspace.id === target.parentId)?.workspace;
	if (parent && (parent.project || dragged.project)) return undefined;
	const reparents = from === -1 || target.parentId !== parentAt(from);
	if (!reparents && (target.before === dragged.id || target.before === nextSibling(from)))
		return undefined;
	return { ...target, reparents };
}

/** An item of the outline (FDR-019), as the navigation view sends it. */
export type OutlineEntry = {
	id: string;
	parentId: string | null;
	text: string;
	note: string;
	done: boolean;
	/** Whether a workspace is attached: the one with this item's ID. */
	workspace: boolean;
};

/** What the outline needs to know of a workspace in use, to show it or leave it out. */
type Shown = { id: string; repoId: string | null; inactive?: boolean };

/**
 * The rows the outline shows, top to bottom (FDR-019), each with how deep it is and how
 * many rows are under it. Leaves out, with what is under them: with `activeOnly`, what is
 * done and the inactive workspaces; with a `focus`, everything but that repository's
 * workspaces, what is above them and what is under them; and what is `folded` away. The
 * item on screen (`viewed`), the one being edited (`editing`) and every workspace in use that
 * is not inactive stay, with what is above them: work going on is never hidden, also not
 * under an item that is done (a parent archived before archiving took its whole tree). `project` marks a project's item
 * (FDR-012), which nothing is put under or above.
 */
export function outlineRows<T extends OutlineEntry>(
	items: T[],
	workspaces: Shown[],
	{
		activeOnly = false,
		focus = null,
		folded = [],
		viewed = null
	}: {
		activeOnly?: boolean;
		focus?: string | null;
		folded?: readonly string[];
		viewed?: string | null;
	} = {}
): (Listed<T & { project: boolean }> & { under: number })[] {
	const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
	const entries = items.map((item) => ({
		...item,
		project: item.workspace && byId.get(item.id)?.repoId === null
	}));
	type Entry = (typeof entries)[number];
	const entryById = new Map(entries.map((entry) => [entry.id, entry]));
	const lineOfEntry = (id: string | null) => lineOf(entryById, id);
	// items ticked off stay, crossed out; workspaces archived or put aside go
	const hidden = (entry: Entry) =>
		activeOnly && entry.workspace && (entry.done || !!byId.get(entry.id)?.inactive);
	const lineIds = (ids: (string | null)[]) =>
		new Set(ids.flatMap((id) => lineOfEntry(id).map((entry) => entry.id)));
	/** What is on screen: it stays, whatever else is left out. */
	const pinned = lineIds([viewed]);
	/** The workspaces in use and not put aside: never hidden, by anything above them either. */
	const live = lineIds(
		entries.filter((entry) => entry.workspace && !entry.done && !hidden(entry)).map(({ id }) => id)
	);

	let shown = entries.filter(
		(entry) => pinned.has(entry.id) || live.has(entry.id) || !lineOfEntry(entry.id).some(hidden)
	);
	if (focus) {
		// a repository with nothing to show shows nothing; one that is gone, everything
		const inRepo = new Set(
			entries
				.filter((entry) => entry.workspace && byId.get(entry.id)?.repoId === focus)
				.map(({ id }) => id)
		);
		if (inRepo.size) {
			const above = new Set([...inRepo].flatMap((id) => lineOfEntry(id).map((entry) => entry.id)));
			const under = (entry: Entry) => lineOfEntry(entry.id).some(({ id }) => inRepo.has(id));
			shown = shown.filter((entry) => above.has(entry.id) || under(entry) || pinned.has(entry.id));
		}
	}
	return unfolded(nested(shown), folded);
}

/**
 * A workspace's scope (FDR-019), from the outline's items: what is under its item, down to
 * the next items with workspaces of their own, which are in it (its child agents) but not
 * what is under them.
 */
export function scopeItems<T extends OutlineEntry>(items: T[], root: string): T[] {
	const byId = new Map(items.map((item) => [item.id, item]));
	return items.filter((item) => {
		const seen = new Set<string>();
		let parent = item.parentId;
		while (parent && !seen.has(parent)) {
			if (parent === root) return true;
			seen.add(parent);
			const above = byId.get(parent);
			if (!above || above.workspace) return false;
			parent = above.parentId;
		}
		return false;
	});
}

/**
 * What shows zoomed into an item (FDR-019): everything under it, at any depth. Where the
 * item is gone (removed, or out of sight), the whole of `items`.
 */
export function zoomedInto<T extends OutlineEntry>(items: T[], zoom: string | null): T[] {
	if (!zoom || !items.some(({ id }) => id === zoom)) return items;
	const byId = new Map(items.map((item) => [item.id, item]));
	return items.filter((item) => lineOf(byId, item.parentId).some(({ id }) => id === zoom));
}

/**
 * The way down to the item zoomed into, for a breadcrumb: the items from just below `root`
 * (the top of the outline where `null`) to it, itself last. Empty where it is not under
 * `root`, or gone.
 */
export function zoomTrail<T extends OutlineEntry>(
	items: T[],
	zoom: string | null,
	root: string | null = null
): T[] {
	if (!zoom || zoom === root) return [];
	const line = lineOf(new Map(items.map((item) => [item.id, item])), zoom).reverse();
	if (!root) return line;
	const below = line.findIndex(({ id }) => id === root);
	return below === -1 ? [] : line.slice(below + 1);
}
