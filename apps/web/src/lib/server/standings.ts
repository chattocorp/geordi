import type { Changes, Upstream } from '@geordi/protocol';

/** How a worktree's work stands: what changed in it, and its pull request, if it has one. */
export type Standing = {
	changes: Pick<Changes, 'files' | 'uncommitted' | 'unpushed'> | null;
	upstream: Upstream | null;
};

/** How long what is known of a worktree is good for, when nothing says it changed. */
const FRESH_MS = 2 * 60_000;
/** Refresh running checks on the next background tick. */
const FRESH_WHILE_PENDING_MS = 15_000;
/** How many worktrees are asked about at a time: the daemon and the forge have other work. */
const AT_ONCE = 3;

/**
 * How every workspace in use stands, for showing them all at a glance (the sidebar). Live
 * data, like everything about worktrees (ADR-003): asked of a daemon, kept in memory, never
 * stored. A worktree someone has open is known as well as can be (`note`); the others are
 * asked about now and then (`tick`), the stalest first, and when something happened that
 * may have changed them (`refresh`).
 */
export function createStandings(options: {
	/** The worktrees in use. */
	worktrees: () => string[];
	/**
	 * Asks a daemon how a worktree stands. Rejects if none can say. `fresh`: as of now, not
	 * from what was learnt a moment ago.
	 */
	load: (worktreeId: string, fresh: boolean, keepKnown: boolean) => Promise<Standing>;
	loadUpstream: (worktreeId: string) => Promise<Upstream | null>;
	now?: () => number;
}) {
	const { worktrees, load, now = Date.now } = options;
	const known = new Map<string, { at: number; localAt: number; standing: Standing }>();
	const loading = new Map<string, symbol>();
	const listeners = new Set<() => void>();

	function note(worktreeId: string, standing: Standing, localAt = now()) {
		known.set(worktreeId, { at: now(), localAt, standing });
		for (const listener of listeners) listener();
	}

	async function refresh(worktreeId: string, fresh = false, upstreamOnly = false) {
		if (loading.has(worktreeId) && !fresh) return;
		const request = Symbol();
		loading.set(worktreeId, request);
		const before = known.get(worktreeId);
		const current = () => loading.get(worktreeId) === request && known.get(worktreeId) === before;
		try {
			if (upstreamOnly && before) {
				const upstream = await options.loadUpstream(worktreeId);
				if (current()) note(worktreeId, { ...before.standing, upstream }, before.localAt);
			} else {
				const standing = await load(worktreeId, fresh, !!before?.standing.upstream);
				if (current()) note(worktreeId, standing);
			}
		} catch {
			if (before && current()) {
				before.at = now();
				if (!upstreamOnly) before.localAt = now();
			}
		} finally {
			if (loading.get(worktreeId) === request) loading.delete(worktreeId);
		}
	}

	const goodFor = (standing: Standing) =>
		standing.upstream?.pull?.checks?.state === 'pending' ? FRESH_WHILE_PENDING_MS : FRESH_MS;

	return {
		get: (worktreeId: string): Standing | null => known.get(worktreeId)?.standing ?? null,
		note,
		refresh,

		/**
		 * Asks about the worktrees that are due. Those nothing is known of yet, all at once:
		 * someone is looking at a list with nothing in it. The others, the stalest first, a
		 * few at a time.
		 */
		async tick() {
			const inUse = worktrees();
			for (const id of known.keys()) if (!inUse.includes(id)) known.delete(id);
			const unknown = inUse.filter((id) => !known.has(id));
			const available = inUse.flatMap((id) => {
				const entry = known.get(id);
				return entry && !loading.has(id) ? [{ id, ...entry }] : [];
			});
			// A full local Git status is expensive. Keep its original budget even when CI is busy.
			const local = available
				.filter(({ localAt }) => now() - localAt >= FRESH_MS)
				.sort((a, b) => a.localAt - b.localAt)
				.slice(0, AT_ONCE)
				.map(({ id }) => id);
			const pulls = available
				.filter(
					({ id, standing, at }) =>
						!local.includes(id) &&
						standing.upstream?.pull?.state === 'open' &&
						now() - at >= goodFor(standing)
				)
				.sort((a, b) => a.at + goodFor(a.standing) - (b.at + goodFor(b.standing)))
				.slice(0, 20);
			await Promise.all([
				...[...unknown, ...local].map((id) => refresh(id)),
				...pulls.map(({ id }) => refresh(id, false, true))
			]);
		},

		/** Calls `listener` whenever something more is known. Returns how to stop that. */
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
