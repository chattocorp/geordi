/**
 * When a workspace needs the person (FDR-008): its agents have stopped working, and nobody
 * else is waiting for them. Pure, so that it can be tested; the browser decides from it
 * what to tell whom (`notifications.svelte.ts`).
 */

/** How a turn ended: stopped is a failure someone asked for. */
export type TurnEnd = 'completed' | 'failed' | 'stopped';

/** What there is to know of one agent's conversation. */
export type Member = {
	status: 'running' | 'idle';
	lastTurn: TurnEnd | null;
	queue: unknown[];
	steering: unknown[];
	updatedAt: string;
};

/**
 * Whether an agent is at work, or about to be: a turn that ends with messages waiting goes
 * straight on to the next, and must not look like an end for the moment in between. Only a
 * failed turn leaves its waiting messages waiting.
 */
export const busy = (member: Member): boolean =>
	member.status === 'running' ||
	member.steering.length > 0 ||
	(member.lastTurn === 'completed' && member.queue.length > 0);

/**
 * How the work of a workspace and the agents working alongside it came to rest: as the turn
 * that ended last did. `null` while any of them is still busy, or before any turn ended.
 */
export function outcome(members: Member[]): TurnEnd | null {
	if (members.some(busy)) return null;
	const last = members
		.filter((member) => member.lastTurn)
		.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
	return last?.lastTurn ?? null;
}

/** A workspace as the sidebar lists it, with what notifying needs to know of it. */
export type Watched = {
	id: string;
	parentId: string | null;
	/** How its work came to rest; `null` while it is busy. */
	outcome: TurnEnd | null;
};

/**
 * The workspaces that have just come to rest and should say so, given how they were last
 * seen (`before`, by ID) and are now. Only a change counts: what was at rest when first seen
 * has been told already, or never needed to be. Not a turn someone stopped (they know), nor
 * one an agent that started it is waiting for (it gets the reply). Which of these is in view
 * is for the caller to know.
 */
export function cameToRest<T extends Watched>(before: Map<string, TurnEnd | null>, now: T[]): T[] {
	const resting = new Map(now.map((workspace) => [workspace.id, workspace.outcome !== null]));
	return now.filter(
		(workspace) =>
			before.get(workspace.id) === null &&
			workspace.outcome !== null &&
			workspace.outcome !== 'stopped' &&
			resting.get(workspace.parentId ?? '') !== false
	);
}
