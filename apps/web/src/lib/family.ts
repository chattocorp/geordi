/**
 * The outline as the sidebar shows it (FDR-016, FDR-017): items, each right after the one it
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

/** Where on a row something is dropped: above it, onto it (under it), or below it. */
export type DropZone = 'above' | 'onto' | 'below';
/** What shows where a drop would go: a row, or (`id` `null`) the end of the list. */
type Line = { id: string | null; edge: DropZone };

/**
 * Where a dragged item would go, dropped on the row at `over` (FDR-016, FDR-017), or below
 * the last one (`over` past the end: last at the top level): under `parentId`, right above
 * `before` (`null`: after the last of its new siblings); `line` is what shows it.
 * `reparents` whether that changes its parent. Nothing where it would stay where it is, or
 * may not go: under itself, under or over a `project`, or at the top unless `topLevel`.
 */
export function dropTarget<T extends { id: string; parentId: string | null; project?: boolean }>(
	rows: Listed<T>[],
	dragged: T,
	over: number,
	zone: DropZone,
	topLevel: boolean
):
	| {
			parentId: string | null;
			before: string | null;
			reparents: boolean;
			line: Line;
	  }
	| undefined {
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
	if (from !== -1) {
		let end = from;
		while (rows[end + 1]?.depth > rows[from].depth) end++;
		if (over >= from && over <= end) return undefined;
	}

	const target = rows[over]?.workspace;
	const firstChild = rows[over + 1]?.depth > rows[over]?.depth ? over + 1 : -1;
	const place: { parentId: string | null; before: string | null; line: Line } = !target
		? { parentId: null, before: null, line: { id: null, edge: 'below' } }
		: zone === 'onto'
			? { parentId: target.id, before: null, line: { id: target.id, edge: zone } }
			: zone === 'above'
				? { parentId: parentAt(over), before: target.id, line: { id: target.id, edge: zone } }
				: firstChild !== -1
					? {
							parentId: target.id,
							before: id(firstChild),
							line: { id: id(firstChild), edge: 'above' as const }
						}
					: {
							parentId: parentAt(over),
							before: nextSibling(over),
							line: { id: target.id, edge: zone }
						};

	if (place.parentId === null && !topLevel) return undefined;
	const parent = rows.find(({ workspace }) => workspace.id === place.parentId)?.workspace;
	if (parent && (parent.project || dragged.project)) return undefined;
	const reparents = from === -1 || place.parentId !== parentAt(from);
	if (!reparents && (place.before === dragged.id || place.before === nextSibling(from)))
		return undefined;
	return { ...place, reparents };
}

/** An item of the outline (FDR-017), as the navigation view sends it. */
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
 * The rows the outline shows, top to bottom (FDR-017), each with how deep it is and how
 * many rows are under it. Leaves out, with what is under them: with `activeOnly`, what is
 * done and the inactive workspaces; with a `focus`, everything but that repository's
 * workspaces, what is above them and what is under them; and what is `folded` away. The
 * item on screen (`viewed`) and the one being edited (`editing`) stay, with what is above them. `project` marks a project's item
 * (FDR-012), which nothing is put under or above.
 */
export function outlineRows<T extends OutlineEntry>(
	items: T[],
	workspaces: Shown[],
	{
		activeOnly = false,
		focus = null,
		folded = [],
		viewed = null,
		editing = null
	}: {
		activeOnly?: boolean;
		focus?: string | null;
		folded?: readonly string[];
		viewed?: string | null;
		editing?: string | null;
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
	const kept = new Set([...lineOfEntry(viewed), ...lineOfEntry(editing)].map(({ id }) => id));
	const hidden = (entry: Entry) =>
		activeOnly && (entry.done || (entry.workspace && !!byId.get(entry.id)?.inactive));

	let shown = entries.filter((entry) => kept.has(entry.id) || !lineOfEntry(entry.id).some(hidden));
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
			shown = shown.filter((entry) => above.has(entry.id) || under(entry) || kept.has(entry.id));
		}
	}
	return unfolded(nested(shown), folded);
}
