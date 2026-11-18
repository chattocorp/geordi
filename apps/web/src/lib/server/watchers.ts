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
	/** Zero until local Git answers, then incremented on each local refresh. */
	version: number;
	/** Keep a saved changeset tab in place until the first release lookup answers. */
	releasePending: boolean;
	/**
	 * Waiting for the first standing, or looking again because it may be out of date in a way
	 * that matters: an agent has just finished a turn, and may have pushed or opened a
	 * pull request. (Not for every look: files change all the time while an agent works.)
	 */
	checking: boolean;
};

type LocalState = Pick<WorktreeState, 'changes' | 'unavailable' | 'missing'>;
export type WorktreeLoad = {
	local: Promise<LocalState>;
	upstream: Promise<Upstream | null>;
	config: Promise<RepoConfig | null>;
	release: Promise<ReleasePlan | null>;
};

const initial: WatchedState = {
	changes: null,
	unavailable: null,
	missing: false,
	upstream: null,
	release: null,
	config: null,
	version: 0,
	releasePending: true,
	checking: true
};

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
	load: (worktreeId: string, fresh: boolean) => WorktreeLoad,
	noteStanding: (id: string, state: WorktreeState) => void
) {
	type Watched = {
		viewers: Set<() => void>;
		state: WatchedState | null;
		loading: boolean;
		pending: boolean | null;
		announced: boolean;
		lastBackgroundAt: number;
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

	/** Publish each answer when it arrives. A burst during a load needs one more pass. */
	function refresh(worktreeId: string, fresh = false, announce = false) {
		const entry = watched.get(worktreeId);
		if (!entry) return;
		const publish = (patch: Partial<WatchedState>) => {
			if (watched.get(worktreeId) !== entry) return;
			entry.state = { ...(entry.state ?? initial), ...patch };
			for (const viewer of entry.viewers) viewer();
		};
		if (announce && entry.state && !entry.state.checking) publish({ checking: true });
		if (entry.loading) {
			entry.pending = fresh || (entry.pending ?? false);
			entry.announced ||= announce;
			return;
		}
		entry.loading = true;
		const answers = load(worktreeId, fresh);
		const local = answers.local.then((result) => {
			const changedBranch = result.changes?.branch !== entry.state?.changes?.branch;
			publish({
				...result,
				version: (entry.state?.version ?? 0) + 1,
				...(changedBranch && { checking: true, upstream: null })
			});
		});
		const standing = Promise.all([local, answers.upstream]).then(([, upstream]) => {
			const latest = entry.state?.upstream;
			if (upstream?.localBranch && upstream.localBranch !== entry.state?.changes?.branch)
				upstream = null;
			if (
				latest?.checkedAt !== undefined &&
				upstream?.checkedAt !== undefined &&
				latest.localBranch === upstream.localBranch &&
				latest.checkedAt > upstream.checkedAt
			)
				upstream = latest;
			publish({ upstream, checking: entry.announced });
			if (watched.get(worktreeId) === entry && entry.state?.changes && !entry.announced)
				noteStanding(worktreeId, entry.state);
		});
		void Promise.all([
			standing,
			answers.config.then((config) => publish({ config })),
			answers.release.then((release) => publish({ release, releasePending: false }))
		]).then(() => {
			if (watched.get(worktreeId) !== entry) return;
			entry.loading = false;
			const pending = entry.pending;
			entry.pending = null;
			entry.announced = false;
			if (pending !== null) refresh(worktreeId, pending);
		});
	}

	// Quiet, archived, or unavailable workspaces may get no background answers.
	const interval = 60_000;
	let timer: NodeJS.Timeout | undefined;
	function keepUpstreamFresh() {
		if (watched.size && !timer)
			timer = setInterval(() => {
				for (const [id, entry] of watched)
					if (Date.now() - entry.lastBackgroundAt >= interval) refresh(id, true);
			}, interval).unref();
		if (!watched.size && timer) timer = void clearInterval(timer);
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
				watched.set(
					worktreeId,
					(entry = {
						viewers: new Set(),
						state: null,
						loading: false,
						pending: null,
						announced: false,
						lastBackgroundAt: 0
					})
				);
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

		/** Publish a background answer without reloading files, diffs or release data. */
		noteUpstream(worktreeId: string, upstream: Upstream | null, branch?: string | null) {
			const entry = watched.get(worktreeId);
			if (
				!entry?.state?.changes ||
				entry.state.checking ||
				(upstream?.localBranch ?? branch) !== entry.state.changes.branch ||
				(upstream?.checkedAt !== undefined &&
					(entry.state.upstream?.checkedAt ?? 0) > upstream.checkedAt)
			)
				return;
			entry.lastBackgroundAt = Date.now();
			entry.state = { ...entry.state, upstream };
			for (const viewer of entry.viewers) viewer();
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
