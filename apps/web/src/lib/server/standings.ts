import type { Changes, Upstream } from '@geordi/protocol';

/** How a worktree's work stands: what changed in it, and its pull request, if it has one. */
export type Standing = {
	changes: Pick<Changes, 'files' | 'uncommitted' | 'unpushed'> | null;
	upstream: Upstream | null;
};

/** How long what is known of a worktree is good for, when nothing says it changed. */
const FRESH_MS = 2 * 60_000;
/** While checks run, things change by the minute. */
const FRESH_WHILE_PENDING_MS = 60_000;
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
	/** Asks a daemon how a worktree stands. Rejects if none can say. */
	load: (worktreeId: string) => Promise<Standing>;
	now?: () => number;
}) {
	const { worktrees, load, now = Date.now } = options;
	const known = new Map<string, { at: number; standing: Standing }>();
	const loading = new Set<string>();
	const listeners = new Set<() => void>();

	function note(worktreeId: string, standing: Standing) {
		known.set(worktreeId, { at: now(), standing });
		for (const listener of listeners) listener();
	}

	async function refresh(worktreeId: string) {
		if (loading.has(worktreeId)) return;
		loading.add(worktreeId);
		try {
			note(worktreeId, await load(worktreeId));
		} catch {
			// nobody could say: what was known stands, and is asked about again in its turn
			const before = known.get(worktreeId);
			if (before) before.at = now();
		} finally {
			loading.delete(worktreeId);
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
			const stale = inUse
				.flatMap((id) => {
					const entry = known.get(id);
					return entry && now() - entry.at >= goodFor(entry.standing) ? [{ id, at: entry.at }] : [];
				})
				.sort((a, b) => a.at - b.at)
				.slice(0, AT_ONCE)
				.map(({ id }) => id);
			await Promise.all([...unknown, ...stale].map(refresh));
		},

		/** Calls `listener` whenever something more is known. Returns how to stop that. */
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
