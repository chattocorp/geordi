/**
 * Workspaces as the sidebar lists them (FDR-002): by repository, as a plain list in which
 * a workspace started by an agent comes right after the one whose agent started it.
 */
/** `repoId` is `null` for a project (FDR-012): projects are listed together, as if theirs were one. */
type Member = { id: string; repoId: string | null; parentId: string | null };

export type Listed<T> = {
	workspace: T;
	/** The workspace whose agent started this one, if it is still around. */
	parent: T | null;
	/** How many listed ancestors it has: 0 for one that stands at the top. */
	depth: number;
};

/** Compare calendar days in the viewer's time zone. */
export function activeOnDay<T extends { updatedAt: string }>(workspaces: T[], day: string | null) {
	return day === null
		? workspaces
		: workspaces.filter((w) => new Date(w.updatedAt).toDateString() === day);
}

/** Keeps the order given, but puts each workspace right after the one that started it. */
export function byRepository<T extends Member>(all: T[]): Map<string | null, Listed<T>[]> {
	return nested(all, (workspace) => workspace.repoId);
}

/**
 * All workspaces as one list, in the order given, each right after the one that started
 * it: also where that is in another repository, or a project.
 */
export function asOneList<T extends Member>(all: T[]): Listed<T>[] {
	return nested(all, () => null).get(null) ?? [];
}

/** The workspaces by `groupOf`, each right after the one that started it, where that is in its group. */
function nested<T extends Member>(
	all: T[],
	groupOf: (workspace: T) => string | null
): Map<string | null, Listed<T>[]> {
	const byId = new Map(all.map((workspace) => [workspace.id, workspace]));
	const parentOf = (workspace: T) => byId.get(workspace.parentId ?? '') ?? null;
	// a workspace follows its parent only where the parent is listed: in the same group
	const follows = (workspace: T) => {
		const parent = parentOf(workspace);
		return !!parent && groupOf(parent) === groupOf(workspace);
	};

	const groups = new Map<string | null, Listed<T>[]>();
	const visited = new Set<string>();
	const list = (workspace: T, depth: number) => {
		if (visited.has(workspace.id)) return; // a cycle: list it once
		visited.add(workspace.id);
		const listed = groups.get(groupOf(workspace)) ?? [];
		groups.set(groupOf(workspace), listed);
		listed.push({ workspace, parent: parentOf(workspace), depth });
		for (const child of all)
			if (child.parentId === workspace.id && follows(child)) list(child, depth + 1);
	};
	for (const workspace of all) if (!follows(workspace)) list(workspace, 0);
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

/**
 * Where the row at `from` would go, dropped onto the row at `over` (on its upper half, or
 * not): among its siblings only, so that it keeps its parent. `before` is the sibling it
 * would go right above, `null` for after the last of them, where `after` is the row the
 * line shows below. Nothing where it would stay where it is, or the row is not among
 * its siblings' (their parent, or another family).
 */
export function dropTarget<T extends { id: string }>(
	rows: Listed<T>[],
	from: number,
	over: number,
	upper: boolean
): { before: string | null; after: string } | undefined {
	const { depth } = rows[from];
	// the siblings and theirs: everything under the parent, or the whole list
	let start = from;
	while (start > 0 && rows[start - 1].depth >= depth) start--;
	let end = from;
	while (end < rows.length - 1 && rows[end + 1].depth >= depth) end++;
	if (over < start || over > end) return undefined;

	const siblingFrom = (at: number) => {
		for (let index = at; index <= end; index++) if (rows[index].depth === depth) return index;
		return -1;
	};
	const next = siblingFrom(upper ? over : over + 1);
	const before = next === -1 ? null : rows[next].workspace.id;
	const after = siblingFrom(from + 1);
	const stays =
		before === rows[from].workspace.id ||
		before === (after === -1 ? null : rows[after].workspace.id);
	return stays ? undefined : { before, after: rows[end].workspace.id };
}
