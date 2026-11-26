/**
 * Workspaces as the sidebar lists them (FDR-016): an outline, in which each workspace comes
 * right after the one it reports to. Grouped, each tree is listed in its root's repository.
 */
/** `repoId` is `null` for a project (FDR-012): projects are listed together, as if theirs were one. */
type Member = { id: string; repoId: string | null; parentId: string | null };

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
 * The active workspaces, where `hideInactive`; otherwise all of them. The workspace on
 * screen (`viewed`) stays, in its place: with the workspaces that started it.
 */
export function withoutInactive<
	T extends { id: string; parentId: string | null; inactive?: boolean }
>(workspaces: T[], hideInactive: boolean, viewed: string | null = null) {
	if (!hideInactive) return workspaces;
	const kept = new Set(lineOf(new Map(workspaces.map((w) => [w.id, w])), viewed));
	return workspaces.filter((w) => kept.has(w) || !w.inactive);
}

/**
 * The trees by the repository of their roots (FDR-016), in the order given, each workspace
 * right after its parent: also where it is in another repository. Not under a project, nor
 * a project under a repository's: what a project started is listed in its own repository.
 */
export function byRepository<T extends Member>(all: T[]): Map<string | null, Listed<T>[]> {
	return nested(
		all,
		(child, parent) => (child.repoId === null) === (parent.repoId === null),
		(root) => root.repoId
	);
}

/** All workspaces as one list, in the order given, each right after its parent. */
export function asOneList<T extends Member>(all: T[]): Listed<T>[] {
	return (
		nested(
			all,
			() => true,
			() => null
		).get(null) ?? []
	);
}

/**
 * The trees, by `groupOf` their roots: each workspace right after its parent where that
 * is listed and `joins` lets it sit under it; else it is a root.
 */
function nested<T extends Member>(
	all: T[],
	joins: (child: T, parent: T) => boolean,
	groupOf: (root: T) => string | null
): Map<string | null, Listed<T>[]> {
	const byId = new Map(all.map((workspace) => [workspace.id, workspace]));
	const parentOf = (workspace: T) => {
		const parent = byId.get(workspace.parentId ?? '');
		return parent && joins(workspace, parent) ? parent : null;
	};
	const childrenOf = Map.groupBy(all, (workspace) => parentOf(workspace)?.id ?? null);

	const groups = new Map<string | null, Listed<T>[]>();
	const visited = new Set<string>();
	const list = (workspace: T, depth: number, listed: Listed<T>[]) => {
		if (visited.has(workspace.id)) return; // a cycle: list it once
		visited.add(workspace.id);
		listed.push({ workspace, parent: byId.get(workspace.parentId ?? '') ?? null, depth });
		for (const child of childrenOf.get(workspace.id) ?? []) list(child, depth + 1, listed);
	};
	const root = (workspace: T) => {
		const group = groupOf(workspace);
		const listed = groups.get(group) ?? [];
		groups.set(group, listed);
		list(workspace, 0, listed);
	};
	for (const workspace of childrenOf.get(null) ?? []) root(workspace);
	// a loop has no root: list its members at the top, rather than not at all
	for (const workspace of all) root(workspace);
	return groups;
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

/**
 * The workspaces the sidebar shows, top to bottom: by repository (in `repoIds`' order),
 * or, not `grouped`, as one list of those in `repoIds` and the projects; leaving out what
 * is folded away. What the previous and next workspace are.
 */
export function inSidebarOrder<T extends Member>(
	all: T[],
	repoIds: readonly string[],
	folded: readonly string[],
	{ includeProjects = false, grouped = true } = {}
): T[] {
	if (!grouped)
		return unfolded(asOneList(shownUngrouped(all, repoIds)), folded).map(
			({ workspace }) => workspace
		);
	const listed = byRepository(all);
	const groups = includeProjects ? [null, ...repoIds] : repoIds;
	return groups
		.filter((repoId) => !folded.includes(repoId ?? 'projects'))
		.flatMap((repoId) => unfolded(listed.get(repoId) ?? [], folded))
		.map(({ workspace }) => workspace);
}

/** What the sidebar lists as one list: the workspaces in `repoIds`, and the projects. */
export function shownUngrouped<T extends Member>(all: T[], repoIds: readonly string[]): T[] {
	return all.filter(({ repoId }) => repoId === null || repoIds.includes(repoId));
}

/**
 * The repositories the sidebar lists: only `focus`, when that is one of them; else all.
 * A focus on a repository that is gone (or has nothing to show) shows everything again.
 */
export function inFocus<T extends { id: string }>(repos: T[], focus: string | null): T[] {
	const focused = repos.filter(({ id }) => id === focus);
	return focused.length > 0 ? focused : repos;
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
 * Where a dragged workspace would go, dropped on the row at `over` (FDR-016), or below the
 * last one (`over` past the end: last at the top level): under `parentId`, right above
 * `before` (`null`: after the last of its new siblings); `line` is what shows it. `reparents` whether that changes its parent. Nothing where it would stay
 * where it is, or may not go: under itself, under or over a project, or at the top of
 * this list unless `topLevel` (its repository's list, or the one list).
 */
export function dropTarget<T extends Member>(
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
	if (parent && (parent.repoId === null || dragged.repoId === null)) return undefined;
	const reparents = from === -1 || place.parentId !== parentAt(from);
	if (!reparents && (place.before === dragged.id || place.before === nextSibling(from)))
		return undefined;
	return { ...place, reparents };
}
