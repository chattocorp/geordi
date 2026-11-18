import { CI_REFRESH_MS, type Changes, type Upstream } from '@geordi/protocol';

/** How a worktree's work stands: what changed in it, and its pull request, if it has one. */
export type Standing = {
	changes:
		(Pick<Changes, 'files' | 'uncommitted' | 'unpushed'> & Partial<Pick<Changes, 'branch'>>) | null;
	upstream: Upstream | null;
};

/** How long what is known upstream is good for, when the daemon names no time. */
const FRESH_MS = 2 * 60_000;
/**
 * A daemon watches worktrees' Git state (not their files: too much to watch everywhere), so
 * a commit, push or checkout is looked at at once. Files that changed without one show
 * this much later.
 */
const LOCAL_FALLBACK_MS = 60_000;
/** An agent at work changes files all the time: its worktree is looked at this often. */
const BUSY_LOCAL_MS = 15_000;
/** How much less often a worktree with an agent at work is looked at upstream. */
const BUSY_FACTOR = 3;
/** How many worktrees are asked about at a time: the daemon and the forge have other work. */
const AT_ONCE = 3;
// Looking again is cheap: a daemon lists a repository's pull requests once for all its
// branches, and reads only what changed. The first look at a branch may need a search.
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
 * watched by the daemon (`watch`), and looked at again when it says one changed (`changed`),
 * when something happened that may have changed them (`refresh`), and upstream now and
 * then (`tick`), the stalest first. Worktrees with an agent at work (`busy`) less often.
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
	/** Whether an agent is at work in a worktree. */
	busy?: (worktreeId: string) => boolean;
	/** Has a daemon watch these worktrees, and report when they change. */
	watch?: (worktreeIds: string[]) => void;
	publishUpstream?: (id: string, upstream: Upstream | null, branch?: string | null) => void;
	now?: () => number;
}) {
	const { worktrees, load, busy = () => false, now = Date.now } = options;
	const known = new Map<string, { at: number; localAt: number; standing: Standing }>();
	const loading = new Map<string, symbol>();
	const listeners = new Set<() => void>();
	/** Worktrees a daemon says changed since they were last looked at. */
	const dirty = new Set<string>();
	let localLoads = 0;
	let watched = '';
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
		if (loading.has(worktreeId) && !fresh) return;
		if (!upstreamOnly) dirty.delete(worktreeId);
		const request = Symbol();
		loading.set(worktreeId, request);
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
			if (loading.get(worktreeId) === request) loading.delete(worktreeId);
		}
	}

	/** Look at the worktrees that changed, or have not been looked at for long: a few at a time. */
	function refreshLocal() {
		const time = now();
		const due = [...known]
			.filter(([id, { localAt }]) => {
				if (loading.has(id)) return false;
				const atWork = busy(id);
				return (
					(dirty.has(id) && !atWork) ||
					time - localAt >= (atWork ? BUSY_LOCAL_MS : LOCAL_FALLBACK_MS)
				);
			})
			.sort(([, a], [, b]) => a.localAt - b.localAt)
			.slice(0, Math.max(0, AT_ONCE - localLoads))
			.map(([id]) => id);
		return due.map(async (id) => {
			localLoads++;
			try {
				await refresh(id);
			} finally {
				localLoads--;
			}
		});
	}

	return {
		get: (worktreeId: string): Standing | null => known.get(worktreeId)?.standing ?? null,
		note,
		refresh,

		/** A daemon says something changed in a worktree nobody has open. */
		changed(worktreeId: string) {
			dirty.add(worktreeId);
			void Promise.all(refreshLocal());
		},

		/** Refresh the oldest due worktrees within the local, PR and discovery budgets. */
		async tick(reconnected = false) {
			const inUse = worktrees();
			for (const id of known.keys()) if (!inUse.includes(id)) known.delete(id);
			for (const id of retryAfter.keys()) if (!inUse.includes(id)) retryAfter.delete(id);
			for (const id of dirty) if (!inUse.includes(id)) dirty.delete(id);
			const key = inUse.join(' ');
			if (reconnected || key !== watched) {
				watched = key;
				options.watch?.(inUse);
			}
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
					(upstream?.refreshAfterMs ??
						(upstream?.pull?.checks?.state === 'pending' ? CI_REFRESH_MS : FRESH_MS)) *
					(busy(id) ? BUSY_FACTOR : 1);
				return [{ id, due: entry.at + interval }];
			});
			const due = available
				.filter((entry) => entry.due <= time)
				.sort((a, b) => a.due - b.due)
				.map((entry) => entry.id);
			await Promise.all([
				...poll(due, (id) => refresh(id, false, true)),
				...discover(unknown, (id) => refresh(id), reconnected),
				// a full local Git status is expensive: never more than a few at a time
				...refreshLocal()
			]);
		},

		/** Calls `listener` whenever something more is known. Returns how to stop that. */
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
