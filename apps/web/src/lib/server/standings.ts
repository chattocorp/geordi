import { CI_REFRESH_MS, type Changes, type Upstream } from '@geordi/protocol';

/** How a worktree's work stands: what changed in it, and its pull request, if it has one. */
export type Standing = {
	changes:
		(Pick<Changes, 'files' | 'uncommitted' | 'unpushed'> & Partial<Pick<Changes, 'branch'>>) | null;
	upstream: Upstream | null;
};

/** How long what is known of a worktree is good for, when nothing says it changed. */
const FRESH_MS = 2 * 60_000;
/** How many worktrees are asked about at a time: the daemon and the forge have other work. */
const AT_ONCE = 3;
// Known PRs share batched reads. Branch discovery can cost one provider request per branch.
const PULL_BATCH = 20;
const DISCOVERY_BATCH = 3;

/** Limit both starts per polling interval and reads still waiting for a provider. */
function readBudget(limit: number, now: () => number) {
	let starts: number[] = [];
	let pending = 0;
	return (ids: string[], read: (id: string) => Promise<void>, reconnected = false) => {
		const time = now();
		starts = reconnected ? [] : starts.filter((at) => time - at < CI_REFRESH_MS);
		const batch = ids.slice(0, limit - Math.max(pending, starts.length));
		return batch.map(async (id) => {
			starts.push(time);
			pending++;
			try {
				await read(id);
			} finally {
				pending--;
			}
		});
	};
}

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
	refreshChanged?: (worktreeId: string) => void;
	publishUpstream?: (id: string, upstream: Upstream | null, branch?: string | null) => void;
	now?: () => number;
}) {
	const { worktrees, load, now = Date.now } = options;
	const known = new Map<string, { at: number; localAt: number; standing: Standing }>();
	const loading = new Map<string, symbol>();
	const listeners = new Set<() => void>();

	let nextLocalBatch = 0;
	const discover = readBudget(DISCOVERY_BATCH, now);
	const poll = readBudget(PULL_BATCH, now);
	const retryAfter = new Map<string, number>();

	function note(worktreeId: string, standing: Standing, localAt = now()) {
		const previous = known.get(worktreeId);
		const stamp = standing.upstream?.checkedAt;
		const cached = stamp !== undefined && previous?.standing.upstream?.checkedAt === stamp;
		retryAfter.delete(worktreeId);
		known.set(worktreeId, { at: cached ? previous.at : now(), localAt, standing });
		for (const listener of listeners) listener();
	}

	async function refresh(worktreeId: string, fresh = false, upstreamOnly = false) {
		const alreadyRefreshing = loading.has(worktreeId);
		if (alreadyRefreshing && !fresh) return;
		const request = Symbol();
		loading.set(worktreeId, request);
		if (!alreadyRefreshing) options.refreshChanged?.(worktreeId);
		const before = known.get(worktreeId);
		const current = () => loading.get(worktreeId) === request && known.get(worktreeId) === before;
		try {
			if (upstreamOnly && before) {
				const upstream = await options.loadUpstream(worktreeId);
				if (current()) {
					note(worktreeId, { ...before.standing, upstream }, before.localAt);
					options.publishUpstream?.(worktreeId, upstream, before.standing.changes?.branch);
				}
			} else {
				const standing = await load(worktreeId, fresh, !!before?.standing.upstream);
				if (current()) {
					note(worktreeId, standing);
					options.publishUpstream?.(worktreeId, standing.upstream, standing.changes?.branch);
				}
			}
		} catch {
			if (!before && current()) retryAfter.set(worktreeId, now() + 20_000);
			if (before && current()) {
				before.at = now();
				if (!upstreamOnly) before.localAt = now();
			}
		} finally {
			if (loading.get(worktreeId) === request) {
				loading.delete(worktreeId);
				options.refreshChanged?.(worktreeId);
			}
		}
	}

	return {
		isRefreshing: (worktreeId: string) => loading.has(worktreeId),
		get: (worktreeId: string): Standing | null => known.get(worktreeId)?.standing ?? null,
		note,
		refresh,

		/** Refresh the oldest due worktrees within the local, PR and discovery budgets. */
		async tick(reconnected = false) {
			const inUse = worktrees();
			for (const id of known.keys()) if (!inUse.includes(id)) known.delete(id);
			for (const id of retryAfter.keys()) if (!inUse.includes(id)) retryAfter.delete(id);
			const time = now();
			const unknown = inUse
				.filter(
					(id) =>
						!known.has(id) && !loading.has(id) && (reconnected || (retryAfter.get(id) ?? 0) <= time)
				)
				.sort((a, b) => (retryAfter.get(a) ?? 0) - (retryAfter.get(b) ?? 0));
			const available = inUse.flatMap((id) => {
				const entry = known.get(id);
				if (!entry || loading.has(id)) return [];
				const upstream = entry.standing.upstream;
				const interval =
					upstream?.refreshAfterMs ??
					(upstream?.pull?.checks?.state === 'pending' ? CI_REFRESH_MS : FRESH_MS);
				return [
					{
						id,
						due: entry.at + interval,
						localAt: entry.localAt,
						open: upstream?.pull?.state === 'open',
						postPush: upstream?.refreshAfterMs === CI_REFRESH_MS
					}
				];
			});
			// A full local Git status is expensive. Keep its original budget even when CI is busy.
			const local = available
				.filter(({ localAt }) => time >= nextLocalBatch && time - localAt >= FRESH_MS)
				.sort((a, b) => a.localAt - b.localAt)
				.slice(0, AT_ONCE)
				.map(({ id }) => id);
			if (local.length) nextLocalBatch = time + 20_000;
			const due = available
				.filter((entry) => entry.due <= time && !local.includes(entry.id))
				.sort((a, b) => a.due - b.due);
			const pulls = due.filter((entry) => entry.open).map((entry) => entry.id);
			const pushed = due.filter((entry) => entry.postPush && !entry.open).map((entry) => entry.id);
			// Known PRs can share a provider read. Finding a PR for a branch needs a search.
			await Promise.all([
				...local.map((id) => refresh(id)),
				...poll(pulls, (id) => refresh(id, false, true)),
				...discover([...pushed, ...unknown], (id) => refresh(id, false, known.has(id)), reconnected)
			]);
		},

		/** Calls `listener` whenever something more is known. Returns how to stop that. */
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
