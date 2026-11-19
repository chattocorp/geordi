import type { WorkspaceStanding } from './actions.ts';
import type { Rest } from './attention.ts';

/**
 * The overview: every workspace in use, sorted by what it needs. Pure, so that it can be
 * tested; the page decides how each lane looks.
 */

/** A workspace as the navigation view lists it, with what sorting it needs to know. */
export type Sortable = {
	id: string;
	working: boolean;
	waiting?: boolean;
	outcome: Rest | null;
	standing: WorkspaceStanding | null;
	updatedAt: string;
};

/**
 * - `attention`: the person is waited for (a question, something wrong) or hasn't looked
 *   since the work came to rest.
 * - `working`: an agent is at it.
 * - `open`: the rest of what is still under way: published or not, in review or not.
 * - `done`: merged or closed: there to be archived.
 */
export type Lane = 'attention' | 'working' | 'open' | 'done';

export const LANES: Lane[] = ['attention', 'working', 'open', 'done'];

export function laneOf(workspace: Sortable, unread: ReadonlySet<string>): Lane {
	// a question goes before everything, at work or not
	if (workspace.outcome === 'asking') return 'attention';
	if (workspace.working && !workspace.waiting) return 'working';
	if (workspace.standing?.tone === 'danger' || unread.has(workspace.id)) return 'attention';
	const done = workspace.standing?.tone === 'merged' || workspace.standing?.label === 'Closed';
	return done ? 'done' : 'open';
}

/** The workspaces by lane, each lane the latest first. Every lane is there, if empty. */
export function lanes<T extends Sortable>(
	all: T[],
	unread: ReadonlySet<string>
): Record<Lane, T[]> {
	const byLane = Object.fromEntries(LANES.map((lane) => [lane, [] as T[]])) as Record<Lane, T[]>;
	const latest = all.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	for (const workspace of latest) byLane[laneOf(workspace, unread)].push(workspace);
	return byLane;
}
