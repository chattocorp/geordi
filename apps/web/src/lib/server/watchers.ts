import type { Changes, ReleasePlan, RepoConfig, Upstream, WorktreeRef } from '@geordi/protocol';
import type { Dispatch } from './workspaces.ts';

/** What a worktree's files and branch look like right now, as far as a daemon could tell. */
export type WorktreeState = {
	/** `null` if the daemon couldn't say; `unavailable` then says why. */
	changes: Changes | null;
	unavailable: string | null;
	/** The daemon says the worktree's directory is not there: not made yet, or removed. */
	missing: boolean;
	/** The branch on the forge the repository is hosted on; `null` if there is none we know. */
	upstream: Upstream | null;
	/** What the worktree holds for the repository's next releases; `null` if it uses no release tool we know. */
	release: ReleasePlan | null;
	/** What the repository's `.geordi.yml` says for this worktree; `null` if the daemon couldn't say. */
	config: RepoConfig | null;
};

/** A worktree's state, and which look at it this is: it changes whenever the files may have. */
export type WatchedState = WorktreeState & {
	version: number;
	/**
	 * Being looked at again right now, because what it says may be out of date in a way
	 * that matters: an agent has just finished a turn, and may have pushed or opened a
	 * pull request. (Not for every look: files change all the time while an agent works.)
	 */
	checking: boolean;
};

/** How often what happens on upstream forges (checks, reviews) is asked for again. */
const UPSTREAM_INTERVAL_MS = 60_000;

/**
 * Keeps the state of the worktrees someone is looking at, and tells the viewers when it
 * changes. A daemon watches those worktrees' files and says when something changed; the
 * state is then loaded once, here, for everyone looking, rather than by each browser.
 * Nothing is stored (ADR-003): a daemon that reconnects is told again what to watch.
 */
export function createWatchers(
	dispatch: Dispatch,
	ref: (worktreeId: string) => WorktreeRef,
	/**
	 * Asks a daemon for a worktree's state. Never rejects. `fresh`: also for how things stand
	 * upstream as of now, not as of the last time someone asked.
	 */
	load: (worktreeId: string, fresh: boolean) => Promise<WorktreeState>
) {
	type Watched = { viewers: Set<() => void>; state: WatchedState | null; loads: number };
	const watched = new Map<string, Watched>();

	/**
	 * Tells the daemon the whole set; it works out what to start and stop watching. One
	 * worktree that can't be resolved must not keep the others from being watched.
	 */
	function sync() {
		const worktrees = [...watched.keys()].flatMap((id) => {
			try {
				return [ref(id)];
			} catch {
				return [];
			}
		});
		dispatch({ type: 'watch', worktrees });
	}

	/** Loads a worktree's state afresh and tells its viewers. The latest load wins. */
	function refresh(worktreeId: string, fresh = false, announce = false) {
		const entry = watched.get(worktreeId);
		if (!entry) return;
		if (announce && entry.state && !entry.state.checking) {
			entry.state = { ...entry.state, checking: true };
			for (const viewer of entry.viewers) viewer();
		}
		const load_ = ++entry.loads;
		load(worktreeId, fresh).then((state) => {
			if (watched.get(worktreeId) !== entry || entry.loads !== load_) return;
			entry.state = { ...state, version: load_, checking: false };
			for (const viewer of entry.viewers) viewer();
		});
	}

	// Nothing tells us when a check finishes or a review comes in: ask now and then.
	let timer: NodeJS.Timeout | undefined;
	function keepUpstreamFresh() {
		if (watched.size > 0 && !timer)
			timer = setInterval(
				() => [...watched.keys()].forEach((id) => refresh(id, true)),
				UPSTREAM_INTERVAL_MS
			).unref();
		if (watched.size === 0 && timer) timer = void clearInterval(timer);
	}

	return {
		/**
		 * Registers a viewer of a worktree, to be told when its state changes. Returns a
		 * function that ends it. Watching starts with the first viewer and ends with the last.
		 */
		watch(worktreeId: string, changed: () => void): () => void {
			ref(worktreeId); // throws for unknown worktrees, before anything is registered
			let entry = watched.get(worktreeId);
			if (!entry) {
				watched.set(worktreeId, (entry = { viewers: new Set(), state: null, loads: 0 }));
				sync();
				refresh(worktreeId);
				keepUpstreamFresh();
			}
			entry.viewers.add(changed);

			return () => {
				entry.viewers.delete(changed);
				if (entry.viewers.size === 0 && watched.get(worktreeId) === entry) {
					watched.delete(worktreeId);
					sync();
					keepUpstreamFresh();
				}
			};
		},

		/** The worktree's state as last loaded; `null` if nobody is looking, or not loaded yet. */
		state: (worktreeId: string): WatchedState | null => watched.get(worktreeId)?.state ?? null,

		/**
		 * Something about a worktree changed: its files or Git state, as a daemon reports.
		 * `fresh` where it may have been something upstream, which nothing here shows: an
		 * agent has just finished a turn, in which it may have opened a pull request.
		 */
		changed: (worktreeId: string, fresh = false) => refresh(worktreeId, fresh, fresh),

		/** A daemon (re)connected: it watches nothing until told, and what we know may be stale. */
		resync() {
			sync();
			[...watched.keys()].forEach((id) => refresh(id));
		}
	};
}
