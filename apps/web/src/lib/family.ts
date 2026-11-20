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

/** Match a workspace title or the name of its repository, within the current sidebar scope. */
export function matchingWorkspaces<T extends { title: string; repoId: string | null }>(
	workspaces: T[],
	repos: { id: string; name: string }[],
	filter: string
) {
	const query = filter.trim().toLowerCase();
	if (!query) return workspaces;
	const matchingRepos = new Set(
		repos.filter((repo) => repo.name.toLowerCase().includes(query)).map((repo) => repo.id)
	);
	return workspaces.filter(
		(w) =>
			w.title.toLowerCase().includes(query) || (w.repoId !== null && matchingRepos.has(w.repoId))
	);
}

/** Keeps the order given, but puts each workspace right after the one that started it. */
export function byRepository<T extends Member>(all: T[]): Map<string | null, Listed<T>[]> {
	const byId = new Map(all.map((workspace) => [workspace.id, workspace]));
	const parentOf = (workspace: T) => byId.get(workspace.parentId ?? '') ?? null;
	// a workspace follows its parent only where the parent is listed: in the same repository
	const follows = (workspace: T) => parentOf(workspace)?.repoId === workspace.repoId;

	const repos = new Map<string | null, Listed<T>[]>();
	const visited = new Set<string>();
	const list = (workspace: T, depth: number) => {
		if (visited.has(workspace.id)) return; // a cycle: list it once
		visited.add(workspace.id);
		const listed = repos.get(workspace.repoId) ?? [];
		repos.set(workspace.repoId, listed);
		listed.push({ workspace, parent: parentOf(workspace), depth });
		for (const child of all)
			if (child.parentId === workspace.id && follows(child)) list(child, depth + 1);
	};
	for (const workspace of all) if (!follows(workspace)) list(workspace, 0);
	return repos;
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
 * leaving out what is folded away. What the previous and next workspace are.
 */
export function inSidebarOrder<T extends Member>(
	all: T[],
	repoIds: readonly string[],
	folded: readonly string[],
	includeProjects = false
): T[] {
	const listed = byRepository(all);
	const groups = includeProjects ? [null, ...repoIds] : repoIds;
	return groups
		.filter((repoId) => !folded.includes(repoId ?? 'projects'))
		.flatMap((repoId) => unfolded(listed.get(repoId) ?? [], folded))
		.map(({ workspace }) => workspace);
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
