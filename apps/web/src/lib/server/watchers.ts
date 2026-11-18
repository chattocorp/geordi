import type {
	Changes,
	PullRequest,
	ReleasePlan,
	RepoConfig,
	Upstream,
	WorktreeRef
} from '@geordi/protocol';
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
	history?: PullRequest[];
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
	upstream: () => Promise<Upstream | null>;
	details: () => { config: Promise<RepoConfig | null>; release: Promise<ReleasePlan | null> };
};

const FALLBACK_MS = 60_000;

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
	 * Loads a worktree. A fresh read checks the upstream forge again. The upstream
	 * lookup may reject if the forge is unavailable.
	 */
	load: (worktreeId: string, fresh: boolean) => WorktreeLoad,
	noteStanding: (id: string, state: WorktreeState) => void,
	knownUpstream: (id: string) => Upstream | null | undefined,
	historical?: (
		id: string,
		currentUrl?: string | null
	) => { key: string; load: () => Promise<PullRequest[]> } | null
) {
	type Watched = {
		viewers: Set<() => void>;
		state: WatchedState | null;
		loading: symbol | null;
		pending: boolean | null;
		details?: ReturnType<WorktreeLoad['details']>;
		fallback?: NodeJS.Timeout;
		historyRead?: { key: string; at: number };
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

	function refreshHistory(id: string, entry: Watched) {
		const request = historical?.(id, entry.state?.upstream?.pull?.url);
		if (!request) return;
		const previous = entry.historyRead;
		if (previous?.key === request.key && Date.now() - previous.at < FALLBACK_MS) return;
		const read = { key: request.key, at: Date.now() };
		entry.historyRead = read;
		void request
			.load()
			.then((history) => {
				if (watched.get(id) !== entry || entry.historyRead !== read) return;
				entry.state = { ...(entry.state ?? initial), history };
				for (const viewer of entry.viewers) viewer();
			})
			.catch(() => {});
	}

	/** Publish each answer when it arrives. A burst during a load needs one more pass. */
	function refresh(
		worktreeId: string,
		{
			fresh = false,
			announce = false,
			cached,
			upstreamOnly = false
		}: { fresh?: boolean; announce?: boolean; cached?: Upstream; upstreamOnly?: boolean } = {}
	) {
		const entry = watched.get(worktreeId);
		if (!entry) return;
		if (entry.loading && !announce) {
			entry.pending = fresh || (entry.pending ?? false);
			return;
		}
		// A turn can finish while an earlier lookup is still waiting for release or Git data.
		const request = Symbol();
		entry.loading = request;
		if (!upstreamOnly) entry.pending = null;
		const current = () => watched.get(worktreeId) === entry && entry.loading === request;
		const publish = (patch: Partial<WatchedState>) => {
			if (!current()) return;
			entry.state = { ...(entry.state ?? initial), ...patch };
			for (const viewer of entry.viewers) viewer();
		};
		if (announce && entry.state && !entry.state.checking) publish({ checking: true });
		const upstreamAtStart = entry.state?.upstream;
		const answers = load(worktreeId, fresh);
		const upstreamAnswer = cached
			? answers.local.then(({ changes }) =>
					changes?.branch === cached.localBranch ? cached : answers.upstream()
				)
			: answers.upstream();
		const local = answers.local.then((result) => {
			const changedBranch =
				result.changes?.branch !== (entry.state?.changes?.branch ?? cached?.localBranch);
			publish({
				...result,
				version: (entry.state?.version ?? 0) + 1,
				...(changedBranch && { checking: true, upstream: null })
			});
		});
		const standing = Promise.all([local, upstreamAnswer.catch(() => undefined)]).then(
			([, answer]) => {
				if (!current()) return;
				const latest = entry.state?.upstream;
				let upstream = answer === undefined ? (latest ?? null) : answer;
				if (cached && upstream === cached && latest === null) upstream = null;
				if (upstream?.localBranch && upstream.localBranch !== entry.state?.changes?.branch)
					upstream = null;
				if (
					latest &&
					latest.localBranch === entry.state?.changes?.branch &&
					((!upstream && latest !== upstreamAtStart) ||
						(latest.checkedAt !== undefined &&
							upstream?.checkedAt !== undefined &&
							latest.checkedAt > upstream.checkedAt))
				)
					upstream = latest;
				if (upstream?.checkedAt !== undefined && upstream.checkedAt !== latest?.checkedAt)
					scheduleFallback(worktreeId, entry);
				publish({ upstream, checking: false });
				if (current()) refreshHistory(worktreeId, entry);
				if (current() && entry.state?.changes) noteStanding(worktreeId, entry.state);
			}
		);
		// PR events need only the branch and upstream status. Carry over any details already
		// in flight so viewers still receive them when the previous load is superseded.
		if (!upstreamOnly) entry.details = answers.details();
		void Promise.all([
			standing,
			entry.details?.config.then((config) => publish({ config })),
			entry.details?.release.then((release) => publish({ release, releasePending: false }))
		]).then(() => {
			if (!current()) return;
			entry.loading = null;
			entry.details = undefined;
			const pending = entry.pending;
			entry.pending = null;
			if (pending !== null) refresh(worktreeId, { fresh: pending });
		});
		return standing;
	}

	// Quiet, archived, or unavailable workspaces may get no background answers.
	function scheduleFallback(id: string, entry: Watched, delay = FALLBACK_MS) {
		clearTimeout(entry.fallback);
		entry.fallback = setTimeout(() => {
			scheduleFallback(id, entry);
			refresh(id, { fresh: true });
		}, delay).unref();
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
				const known = knownUpstream(worktreeId);
				const age = Date.now() - (known?.checkedAt ?? -Infinity);
				const cached =
					known?.localBranch &&
					age >= 0 &&
					age < Math.min(known.refreshAfterMs ?? FALLBACK_MS, FALLBACK_MS)
						? known
						: undefined;
				watched.set(
					worktreeId,
					(entry = {
						viewers: new Set(),
						state: cached ? { ...initial, checking: false, upstream: cached } : null,
						loading: null,
						pending: null
					})
				);
				sync();
				refresh(worktreeId, { cached });
				scheduleFallback(worktreeId, entry, cached ? FALLBACK_MS - age : FALLBACK_MS);
			}
			entry.viewers.add(changed);

			return () => {
				entry.viewers.delete(changed);
				if (entry.viewers.size === 0 && watched.get(worktreeId) === entry) {
					watched.delete(worktreeId);
					sync();
					clearTimeout(entry.fallback);
				}
			};
		},

		/** Publish a background answer without reloading files, diffs or release data. */
		noteUpstream(worktreeId: string, upstream: Upstream | null, branch?: string | null) {
			const entry = watched.get(worktreeId);
			if (
				!entry?.state ||
				(!entry.state.changes && !entry.state.upstream?.localBranch) ||
				entry.state.checking ||
				(upstream?.localBranch ?? branch) !==
					(entry.state.changes?.branch ?? entry.state.upstream?.localBranch) ||
				(upstream?.checkedAt !== undefined &&
					(entry.state.upstream?.checkedAt ?? 0) > upstream.checkedAt)
			)
				return;
			if (
				upstream?.checkedAt === undefined ||
				upstream.checkedAt !== entry.state.upstream?.checkedAt
			)
				scheduleFallback(worktreeId, entry);
			entry.state = { ...entry.state, upstream };
			refreshHistory(worktreeId, entry);
			for (const viewer of entry.viewers) viewer();
		},

		refreshUpstream: (worktreeId: string) =>
			refresh(worktreeId, { fresh: true, announce: true, upstreamOnly: true }),

		isWatched: (worktreeId: string) => watched.has(worktreeId),

		/** The worktree's state as last loaded; `null` if nobody is looking, or not loaded yet. */
		state: (worktreeId: string): WatchedState | null => watched.get(worktreeId)?.state ?? null,

		/**
		 * Reload the files and Git state. Continuing a workspace on another branch also
		 * needs fresh upstream status.
		 */
		changed: (worktreeId: string, fresh = false) => refresh(worktreeId, { fresh, announce: fresh }),

		/** A daemon (re)connected: it watches nothing until told, and what we know may be stale. */
		resync() {
			sync();
			for (const [id, entry] of watched) {
				delete entry.historyRead;
				refresh(id);
			}
		}
	};
}
