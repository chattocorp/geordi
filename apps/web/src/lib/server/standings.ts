import { CI_REFRESH_MS, type Changes, type Upstream } from '@geordi/protocol';

/** What a daemon says of a worktree's files and branch. */
export type Local = {
	/** `null` if the daemon couldn't say; `unavailable` then says why. */
	changes: Changes | null;
	unavailable: string | null;
	/** The daemon says the worktree's directory is not there: not made yet, or removed. */
	missing: boolean;
};

/** How a worktree's work stands: what changed in it, and its pull request, if it has one. */
export type Standing = { changes: Changes | null; upstream: Upstream | null };

/** A worktree's standing, with what someone looking at it needs to know about it besides. */
export type WorktreeStanding = Local & {
	/** The branch on the forge the repository is hosted on; `null` if there is none we know. */
	upstream: Upstream | null;
	/**
	 * Why the forge could not be asked, once that happened twice in a row: `upstream` is
	 * then what was last known. `null` while asking works.
	 */
	upstreamProblem: string | null;
	/** Zero until local Git answers, then incremented with each look at it. */
	version: number;
	/**
	 * Waiting for the first standing, or looking again because it may be out of date in a way
	 * that matters: an agent has just finished a turn, and may have pushed or opened a
	 * pull request. (Not for every look: files change all the time while an agent works.)
	 */
	checking: boolean;
};

/** How long what is known upstream is good for, when the daemon names no time. */
const FRESH_MS = 2 * 60_000;
/**
 * A daemon says when a worktree changes: its Git state everywhere, its files too where
 * someone has it open. What it missed shows this much later.
 */
const LOCAL_FALLBACK_MS = 60_000;
/** An agent at work changes files all the time: its worktree is looked at this often. */
const BUSY_LOCAL_MS = 15_000;
/** How much less often a worktree with an agent at work, which nobody has open, is looked at upstream. */
const BUSY_FACTOR = 3;
/** How soon to ask again about what nobody could say anything of. */
const RETRY_MS = 20_000;
/** How many worktrees' local Git is asked about at a time: a full status is expensive. */
const AT_ONCE = 3;
/** How many first looks upstream run at a time. A daemon answers those that arrive together with few requests. */
const FIRST_AT_ONCE = 8;
/** How many known worktrees are asked about upstream per `CI_REFRESH_MS`. */
const PULL_BATCH = 20;

/** Limit both starts per polling interval and reads still waiting for a provider. */
function readBudget(limit: number, now: () => number) {
	let starts: number[] = [];
	let pending = 0;
	return (ids: string[], read: (id: string) => Promise<void>) => {
		const time = now();
		starts = starts.filter((at) => time - at < CI_REFRESH_MS);
		const batch = ids.slice(0, Math.max(0, limit - Math.max(pending, starts.length)));
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

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Whether two answers say the same, whenever they were given. */
const sameUpstream = (a: Upstream | null, b: Upstream | null) =>
	JSON.stringify(a && { ...a, checkedAt: 0 }) === JSON.stringify(b && { ...b, checkedAt: 0 });

/**
 * How every worktree in use stands: the one place the forge knows it from, for the sidebar
 * and for whoever has a workspace open (`watchers.ts`). Live data, like everything about
 * worktrees (ADR-003): asked of a daemon, kept in memory, never stored.
 *
 * Local Git and the upstream forge are asked separately, so that neither waits for the
 * other: a slow or unreachable forge never keeps changed files from showing. A daemon
 * watches the worktrees and says when one changed (`changed`); upstream is asked now and
 * then (`tick`), the stalest first, and at once when something happened that may show
 * there (`look`): a push, another branch, the end of a turn.
 */
export function createStandings(options: {
	/** The worktrees in use, and those someone has open. */
	worktrees: () => string[];
	/** Asks a daemon about a worktree's files and branch. Never rejects: it says why it could not. */
	loadLocal: (worktreeId: string) => Promise<Local>;
	/**
	 * Asks a daemon how a worktree's branch stands upstream. Rejects if there is no telling.
	 * `fresh`: as of now, not from what was learnt a moment ago.
	 */
	loadUpstream: (worktreeId: string, fresh: boolean) => Promise<Upstream | null>;
	/** Whether an agent is at work in a worktree. */
	busy?: (worktreeId: string) => boolean;
	/** Whether someone has a worktree open: a daemon then reports every change of its files. */
	open?: (worktreeId: string) => boolean;
	/** Has a daemon watch these worktrees, and report when they change. */
	watch?: (worktreeIds: string[]) => void;
	/** Told when the forge cannot be asked about a worktree: once per reason. */
	warn?: (worktreeId: string, problem: string) => void;
	now?: () => number;
}) {
	const {
		worktrees,
		busy = () => false,
		open = () => false,
		warn = () => {},
		now = Date.now
	} = options;

	const locals = new Map<string, Local & { at: number; version: number }>();
	const remotes = new Map<
		string,
		{
			/** When to count the next look from. */
			at: number;
			/** The daemon's time of the answer: the same again means it had nothing newer. */
			stamp?: number;
			upstream: Upstream | null;
			/** Whether the forge has answered at all. */
			answered: boolean;
			failures: number;
			problem: string | null;
			warned?: string;
		}
	>();
	const listeners = new Set<(worktreeId: string) => void>();
	/** Looks at local Git in flight, and those to follow them. */
	const reading = new Map<string, Promise<void>>();
	const queued = new Map<string, Promise<void>>();
	/** Looks upstream in flight: only the latest one's answer counts. */
	const looks = new Map<string, { token: symbol; promise: Promise<void> }>();
	/** Worktrees being looked at because something may have happened there (`checking`). */
	const announced = new Map<string, symbol>();
	/** Worktrees nobody has open that a daemon says changed since they were last looked at. */
	const dirty = new Set<string>();
	/** Worktrees whose local Git a tick found due, waiting for a free look. */
	const waiting = new Set<string>();
	let watched = '';
	const poll = readBudget(PULL_BATCH, now);

	const tell = (worktreeId: string) => {
		for (const listener of listeners) listener(worktreeId);
	};

	/** How long after a look upstream the next one is due. */
	function intervalOf(
		worktreeId: string,
		remote: { answered: boolean; upstream: Upstream | null }
	) {
		if (!remote.answered) return RETRY_MS;
		const { upstream } = remote;
		const said =
			upstream?.refreshAfterMs ??
			(upstream?.pull?.checks?.state === 'pending' ? CI_REFRESH_MS : FRESH_MS);
		return said * (busy(worktreeId) && !open(worktreeId) ? BUSY_FACTOR : 1);
	}

	/** What is known upstream, unless it is of another branch than the worktree is on. */
	function upstreamOf(worktreeId: string): Upstream | null {
		const upstream = remotes.get(worktreeId)?.upstream ?? null;
		const changes = locals.get(worktreeId)?.changes;
		return changes && upstream?.localBranch !== undefined && upstream.localBranch !== changes.branch
			? null
			: upstream;
	}

	function tookLocal(worktreeId: string, answer: Local) {
		const previous = locals.get(worktreeId);
		// nobody could say (no daemon, say): what was known stands
		if (!answer.changes && !answer.missing && previous?.changes) {
			previous.at = now();
			return;
		}
		locals.set(worktreeId, { ...answer, at: now(), version: (previous?.version ?? 0) + 1 });
		const before = previous?.changes;
		const { changes } = answer;
		// a worktree that is there now (made, or its daemon back): the forge can be asked
		if (previous && !before && changes) void lookUpstream(worktreeId, { again: true });
		if (before && changes) {
			const known = remotes.get(worktreeId)?.upstream;
			if (before.branch !== changes.branch && (known?.localBranch ?? null) !== changes.branch) {
				// on another branch: what is known upstream is not about this one
				remotes.delete(worktreeId);
				void lookUpstream(worktreeId, { fresh: true });
			} else if (before.unpushed !== changes.unpushed)
				// pushed: the daemon knows what that means for the pull request
				void lookUpstream(worktreeId, { again: true });
		}
		tell(worktreeId);
	}

	function startLocal(worktreeId: string) {
		dirty.delete(worktreeId);
		waiting.delete(worktreeId);
		const read: Promise<void> = options
			.loadLocal(worktreeId)
			.catch((error): Local => ({ changes: null, unavailable: reason(error), missing: false }))
			.then((answer) => {
				if (reading.get(worktreeId) !== read) return;
				reading.delete(worktreeId);
				tookLocal(worktreeId, answer);
				// a look is free: the next one due need not wait for a tick
				pump();
			});
		reading.set(worktreeId, read);
		return read;
	}

	/** Looks at a worktree's local Git. A look in flight may have missed what prompted this one: another follows it. */
	function lookLocal(worktreeId: string): Promise<void> {
		const running = reading.get(worktreeId);
		if (!running) return startLocal(worktreeId);
		let next = queued.get(worktreeId);
		if (!next) {
			next = running.then(() => {
				queued.delete(worktreeId);
				return startLocal(worktreeId);
			});
			queued.set(worktreeId, next);
		}
		return next;
	}

	/**
	 * Asks how a worktree stands upstream. One look at a time: `again` and `fresh` start
	 * another where one is in flight, whose answer then no longer counts.
	 */
	function lookUpstream(
		worktreeId: string,
		{ fresh = false, again = fresh }: { fresh?: boolean; again?: boolean } = {}
	): Promise<void> {
		const running = looks.get(worktreeId);
		if (running && !again) return running.promise;
		const token = Symbol();
		const settle = (apply: () => boolean) => {
			if (looks.get(worktreeId)?.token !== token) return;
			looks.delete(worktreeId);
			if (apply()) tell(worktreeId);
		};
		const promise = options.loadUpstream(worktreeId, fresh).then(
			(upstream) =>
				settle(() => {
					const previous = remotes.get(worktreeId);
					const same = !!previous?.answered && sameUpstream(previous.upstream, upstream);
					// The daemon's own earlier answer (asked because of a push, say) is due again when
					// that one was. Unless it already is: then the daemon is not asking the forge for
					// now (rate limited), and asking it again at once would not help.
					const cached =
						upstream?.checkedAt !== undefined &&
						previous?.stamp === upstream.checkedAt &&
						now() < previous.at + intervalOf(worktreeId, previous);
					remotes.set(worktreeId, {
						at: cached ? previous.at : now(),
						stamp: upstream?.checkedAt,
						upstream: same ? previous.upstream : upstream,
						answered: true,
						failures: 0,
						problem: null
					});
					return !same || !!previous?.problem;
				}),
			(error) =>
				settle(() => {
					const previous = remotes.get(worktreeId);
					const message = reason(error);
					const failures = (previous?.failures ?? 0) + 1;
					// once may be a hiccup; twice is worth saying
					const problem = failures > 1 ? message : (previous?.problem ?? null);
					if (previous?.warned !== message) warn(worktreeId, message);
					remotes.set(worktreeId, {
						upstream: previous?.upstream ?? null,
						stamp: previous?.stamp,
						answered: previous?.answered ?? false,
						at: now(),
						failures,
						problem,
						warned: message
					});
					return !previous || problem !== previous.problem;
				})
		);
		looks.set(worktreeId, { token, promise });
		return promise;
	}

	/**
	 * Looks at local Git that is due, a few at a time: what a tick found due, and what changed
	 * where nobody has it open and no agent is at work. Open worktrees first, then the stalest.
	 */
	function pump() {
		const at = (id: string) => locals.get(id)?.at ?? -Infinity;
		const due = [...new Set([...waiting, ...[...dirty].filter((id) => !busy(id))])]
			.filter((id) => !reading.has(id))
			.sort((a, b) => Number(open(b)) - Number(open(a)) || at(a) - at(b) || 0);
		return due.slice(0, Math.max(0, AT_ONCE - reading.size)).map(startLocal);
	}

	return {
		/**
		 * How a worktree stands; `null` until both local Git and the forge were asked. Half
		 * of it would say the wrong thing: that a branch with a pull request has none.
		 */
		get(worktreeId: string): Standing | null {
			const local = locals.get(worktreeId);
			if (!local || (!remotes.has(worktreeId) && !local.missing)) return null;
			return { changes: local.changes, upstream: upstreamOf(worktreeId) };
		},

		/** The same, with all that someone looking at the worktree is shown. */
		state(worktreeId: string): WorktreeStanding | null {
			const local = locals.get(worktreeId);
			const remote = remotes.get(worktreeId);
			if (!local && !remote) return null;
			return {
				changes: local?.changes ?? null,
				unavailable: local?.unavailable ?? null,
				missing: local?.missing ?? false,
				version: local?.version ?? 0,
				upstream: upstreamOf(worktreeId),
				upstreamProblem: remote?.problem ?? null,
				// a worktree that is not there has no branch to ask the forge about
				checking: !local || (!remote && !local.missing) || announced.has(worktreeId)
			};
		},

		/**
		 * Looks at a worktree now, locally and upstream. `fresh`: upstream as of now, because
		 * something may just have happened there that nothing here shows (a pull request
		 * opened, a review). `announce`: say that what is known may be out of date meanwhile.
		 */
		async look(
			worktreeId: string,
			{ fresh = false, announce = false }: { fresh?: boolean; announce?: boolean } = {}
		) {
			const token = Symbol();
			if (announce) {
				announced.set(worktreeId, token);
				tell(worktreeId);
			}
			try {
				await Promise.all([
					lookLocal(worktreeId),
					lookUpstream(worktreeId, { fresh, again: true })
				]);
			} finally {
				if (announced.get(worktreeId) === token) {
					announced.delete(worktreeId);
					tell(worktreeId);
				}
			}
		},

		/**
		 * The worktree's pull request was merged from here: shown at once, rather than once the
		 * forge has been asked again (a look that started before the merge no longer counts).
		 */
		merged(worktreeId: string, number: string) {
			looks.delete(worktreeId);
			const remote = remotes.get(worktreeId);
			const pull = remote?.upstream?.pull;
			if (!remote?.upstream || pull?.number !== number || pull.state === 'merged') return;
			remote.upstream = { ...remote.upstream, pull: { ...pull, state: 'merged' } };
			tell(worktreeId);
		},

		/** A daemon says something changed in a worktree. */
		changed(worktreeId: string) {
			// someone is looking: at once, whoever is at work there
			if (open(worktreeId)) return void lookLocal(worktreeId);
			dirty.add(worktreeId);
			pump();
		},

		/**
		 * Looks at what is due: worktrees someone has open first, then those nothing is known
		 * of, then the stalest.
		 * `reconnected`: a daemon is there (again) to ask.
		 */
		async tick(reconnected = false) {
			const inUse = worktrees();
			const used = new Set(inUse);
			for (const known of [locals, remotes, announced])
				for (const id of known.keys()) if (!used.has(id)) known.delete(id);
			for (const pending of [dirty, waiting])
				for (const id of pending) if (!used.has(id)) pending.delete(id);
			const key = inUse.join(' ');
			if (reconnected || key !== watched) {
				watched = key;
				options.watch?.(inUse);
			}
			const time = now();

			for (const id of inUse) {
				if (reading.has(id)) continue;
				const local = locals.get(id);
				if (!local) {
					waiting.add(id);
					continue;
				}
				const atWork = busy(id) && !open(id);
				const every =
					!local.changes && !local.missing
						? reconnected
							? 0
							: RETRY_MS
						: atWork
							? BUSY_LOCAL_MS
							: LOCAL_FALLBACK_MS;
				// what a daemon may have missed while it was away, where someone is looking
				if ((reconnected && open(id)) || time - local.at >= every) waiting.add(id);
			}
			const localDue = pump();

			const first: string[] = [];
			const due: { id: string; due: number }[] = [];
			for (const id of inUse) {
				if (looks.has(id) || locals.get(id)?.missing) continue;
				const remote = remotes.get(id);
				if (!remote || (reconnected && (!remote.answered || open(id)))) {
					first.push(id);
					continue;
				}
				const interval = intervalOf(id, remote);
				if (remote.at + interval <= time) due.push({ id, due: remote.at + interval });
			}
			await Promise.all([
				...localDue,
				...first.slice(0, Math.max(0, FIRST_AT_ONCE - looks.size)).map((id) => lookUpstream(id)),
				...poll(
					due.sort((a, b) => a.due - b.due).map((entry) => entry.id),
					(id) => lookUpstream(id)
				)
			]);
		},

		/** Calls `listener` whenever something more is known of a worktree. Returns how to stop that. */
		subscribe(listener: (worktreeId: string) => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}

export type Standings = ReturnType<typeof createStandings>;
