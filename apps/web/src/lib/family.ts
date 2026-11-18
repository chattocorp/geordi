/**
 * Workspaces as the sidebar lists them (FDR-002): by repository, as a plain list in which
 * a workspace started by an agent comes right after the one whose agent started it.
 */
/** `repoId` is `null` for the Desk (FDR-012): listed together, as if theirs were one. */
type Member = { id: string; repoId: string | null; parentId: string | null };

export type Listed<T> = {
	workspace: T;
	/** The workspace whose agent started this one, if it is still around. */
	parent: T | null;
	/** How many listed ancestors it has: 0 for one that stands at the top. */
	depth: number;
};

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
