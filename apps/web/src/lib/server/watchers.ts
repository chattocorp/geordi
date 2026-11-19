import type { ReleasePlan, RepoConfig, WorktreeRef } from '@geordi/protocol';
import type { Standings, WorktreeStanding } from './standings.ts';
import type { Dispatch } from './workspaces.ts';

/** What someone who has a worktree open is shown of it, as far as a daemon could tell. */
export type WatchedState = WorktreeStanding & {
	/** What the worktree holds for the repository's next releases; `null` if it uses no release tool we know. */
	release: ReleasePlan | null;
	/** What the repository's `.geordi.yml` says for this worktree; `null` if the daemon couldn't say. */
	config: RepoConfig | null;
	/** Keep a saved changeset tab in place until the first release lookup answers. */
	releasePending: boolean;
};

export type Details = { config: Promise<RepoConfig | null>; release: Promise<ReleasePlan | null> };

const unknown: WorktreeStanding = {
	changes: null,
	unavailable: null,
	missing: false,
	upstream: null,
	upstreamProblem: null,
	version: 0,
	checking: true
};

/**
 * Keeps track of the worktrees someone is looking at, and tells the viewers when what they
 * see changes. A daemon watches those worktrees' files; how they stand is kept in one place
 * for everyone (`standings.ts`), and what only a viewer needs (the repository's
 * configuration, its release plan) is loaded here, once for all of them, whenever the
 * worktree's files may have changed. Nothing is stored (ADR-003): a daemon that reconnects
 * is told again what to watch.
 */
export function createWatchers(
	dispatch: Dispatch,
	ref: (worktreeId: string) => WorktreeRef,
	standings: Pick<Standings, 'state' | 'look' | 'subscribe'>,
	/** Asks a daemon for a worktree's configuration and release plan. Neither rejects. */
	loadDetails: (worktreeId: string) => Details
) {
	type Watched = {
		viewers: Set<() => void>;
		config: RepoConfig | null;
		release: ReleasePlan | null;
		releasePending: boolean;
		/** The look at the worktree's files the details were last loaded for. */
		version?: number;
		loading: boolean;
	};
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

	/**
	 * Loads the details again if the files were looked at since: one load at a time.
	 * `ahead`: a look at the files starts along with this load, whose answer needs no other.
	 */
	function details(worktreeId: string, entry: Watched, ahead = 0) {
		const version = standings.state(worktreeId)?.version ?? 0;
		if (entry.loading || entry.version === version) return;
		entry.version = version + ahead;
		entry.loading = true;
		const current = () => watched.get(worktreeId) === entry;
		const publish = (patch: Partial<Watched>) => {
			if (!current()) return;
			Object.assign(entry, patch);
			for (const viewer of entry.viewers) viewer();
		};
		const { config, release } = loadDetails(worktreeId);
		void Promise.all([
			config.then((config) => publish({ config })),
			release.then((release) => publish({ release, releasePending: false }))
		]).finally(() => {
			entry.loading = false;
			if (current()) details(worktreeId, entry);
		});
	}

	standings.subscribe((worktreeId) => {
		const entry = watched.get(worktreeId);
		if (!entry) return;
		details(worktreeId, entry);
		for (const viewer of entry.viewers) viewer();
	});

	return {
		/**
		 * Registers a viewer of a worktree, to be told when its state changes. Returns a
		 * function that ends it. Watching starts with the first viewer and ends with the last.
		 */
		watch(worktreeId: string, changed: () => void): () => void {
			ref(worktreeId); // throws for unknown worktrees, before anything is registered
			let entry = watched.get(worktreeId);
			if (!entry) {
				entry = {
					viewers: new Set(),
					config: null,
					release: null,
					releasePending: true,
					loading: false
				};
				watched.set(worktreeId, entry);
				sync();
				details(worktreeId, entry, 1);
				// What the sidebar knew shows at once. Its files are watched from now on, and an
				// open pull request is shown with each of its checks: both are looked at again.
				void standings.look(worktreeId);
			}
			entry.viewers.add(changed);

			return () => {
				entry.viewers.delete(changed);
				if (entry.viewers.size === 0 && watched.get(worktreeId) === entry) {
					watched.delete(worktreeId);
					sync();
				}
			};
		},

		isWatched: (worktreeId: string) => watched.has(worktreeId),

		/** The worktrees someone is looking at. */
		ids: () => [...watched.keys()],

		/** What the worktree's viewers are shown; `null` if nobody is looking. */
		state(worktreeId: string): WatchedState | null {
			const entry = watched.get(worktreeId);
			if (!entry) return null;
			const { config, release, releasePending } = entry;
			return { ...(standings.state(worktreeId) ?? unknown), config, release, releasePending };
		},

		/** A daemon (re)connected: it watches nothing until told. */
		resync: sync
	};
}
