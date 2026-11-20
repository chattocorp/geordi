import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { reviewRelease } from './release-review.ts';
import { quietGit } from './git.ts';
import {
	CI_REFRESH_MS,
	type CheckCounts,
	type ForgeDiagnostic,
	type PullCheck,
	type PullRequest,
	type Upstream
} from '@geordi/protocol';
import {
	createForges,
	ForgeApiError,
	RateLimitedError,
	github,
	MergeMethodRequiredError,
	type Check,
	type ResolvedThreadRef,
	type ForgeProvider,
	type Forges,
	type MergeMethod,
	type Thread
} from 'forges';
import { providersFromEnv } from 'forges/env';
import { findBranchPulls, graphqlOf, readPull, rollupCounts } from './pull-batch.ts';
import { createRateLimits } from './rate-limit.ts';
import { createRecentPulls } from './recent-pulls.ts';
import { upstreamBranchOf, gitIn, headOf, type Worktree } from './worktree.ts';

/**
 * Talks to the forge a repository is hosted on (ADR-006), through the `forges` library so
 * that GitHub is just the first of many. Runs in the daemon: that is where the repository,
 * its remotes and the user's credentials are.
 */

/**
 * How long an answer is reused, by what it says. Looking again mostly costs nothing (the
 * repository's pull requests are listed with a validator: see `recent-pulls.ts`), but each
 * look is work here too. A pull request that was merged or closed hardly changes again, and
 * a push or another branch is noticed here without asking: after a push, a branch without
 * a pull request is looked at as often as an open one for a while (`PUSHED_MS`), since one
 * is usually opened next.
 */
const OPEN_MS = CI_REFRESH_MS;
const NO_PULL_MS = 20_000;
const PUSHED_MS = 60_000;
const SETTLED_MS = 60_000;
const FRESH_ANONYMOUS_MS = 5 * 60_000;
/**
 * How often an open pull request is read in full though the listing says it is unchanged:
 * whether it conflicts with its base changes when the base moves, which does not count as
 * an update of the pull request.
 */
const OPEN_READ_MS = 60_000;
/**
 * How many times in a row an open pull request is read again at the next look while the
 * forge is still working out whether it can be merged (GitHub does so lazily). After that,
 * it is read as usual: a forge that never says must not cost a full read at every look.
 */
const UNSETTLED_READS = 3;
/** How many of a repository's most recently updated pull requests are gone through for the branch. */
const SEARCH_LIMIT = 100;

/** The token the GitHub CLI is signed in with, if it is installed and signed in. */
async function ghToken(): Promise<string | null> {
	try {
		const { stdout } = await promisify(execFile)('gh', ['auth', 'token'], {
			timeout: 5000,
			killSignal: 'SIGKILL'
		});
		const token = stdout.trim();
		return token || null;
	} catch {
		return null;
	}
}

/** Every request to a forge goes through this, so that its rate limits pause our reads. */
const limits = createRateLimits();
const recentPulls = createRecentPulls();

let registry: { value: Promise<Forges>; at: number } | undefined;
/** How long credentials are trusted: signing in to the GitHub CLI should not take a restart to notice. */
const CREDENTIALS_MS = 10 * 60_000;

/**
 * The forges we can talk to: every one configured through `FORGES_*` environment variables
 * (see https://forges.link/reference/environment-variables), plus github.com, signed in as
 * the GitHub CLI is, or anonymously (public repositories only).
 */
function forges() {
	if (registry && Date.now() - registry.at < CREDENTIALS_MS) return registry.value;
	const value = loadForges();
	registry = { value, at: Date.now() };
	void value.catch(() => {
		if (registry?.value === value) registry = undefined;
	});
	return value;
}

async function loadForges() {
	const providers = providersFromEnv(process.env, { fetch: limits.fetch }).flatMap(
		(set) => set.provider ?? []
	);

	if (!providers.some((p) => p.forge === 'github' && p.instance === 'github.com')) {
		const token = await ghToken();
		const provider = github({
			fetch: limits.fetch,
			...(token && { auth: { type: 'token', token } as const })
		});
		providers.push(provider);
	}
	return createForges(providers);
}

/** How many checks stand how. */
export function count(states: Check['state'][]): CheckCounts {
	const counts = { passed: 0, failed: 0, pending: 0, skipped: 0 };
	const kinds = { success: 'passed', failure: 'failed', pending: 'pending' } as const;
	for (const state of states) counts[kinds[state as keyof typeof kinds] ?? 'skipped']++;
	return counts;
}

/** Background standings need only counts. An open workspace also requests individual checks. */
async function checksFor(
	provider: ForgeProvider,
	repo: Repo,
	pull: Thread,
	includeChecks: boolean
) {
	const counts = rollupCounts(pull);
	const sha = pull.branches?.head.sha;
	if (
		(!includeChecks && (counts || pull.state !== 'open')) ||
		!pull.checks ||
		!sha ||
		!provider.can('checks.list')
	)
		return { counts };
	try {
		const page = await provider.checks.list(repo, sha);
		if (
			!page.cursor &&
			!page.warnings?.some((warning) => warning.code === 'checks_unreadable') &&
			page.items.length
		) {
			return {
				counts: count(page.items.map((check) => check.state)),
				items: includeChecks
					? page.items.map(({ ref, name, state, stateRaw, conclusionRaw, startedAt, url }) => ({
							id: ref.type + '/' + ref.id,
							name,
							state,
							status: (conclusionRaw || stateRaw).toLowerCase(),
							startedAt: startedAt?.getTime(),
							url
						}))
					: undefined
			};
		}
	} catch {
		// The pull request summary is still available.
	}
	return { counts };
}

/**
 * Whether an open pull request conflicts with its base. `forges` does not say, so we read
 * the forge's own answer, which comes with the full pull request: GitHub's `mergeable_state`
 * (`mergeable` is false for other reasons too), GitLab's `has_conflicts`, and Gitea's and
 * Forgejo's `mergeable`. `undefined` where there is no telling (GitHub works it out lazily,
 * and says on a later ask).
 */
export function conflictsOf(thread: Thread): boolean | undefined {
	if (thread.state !== 'open' || !thread.raw || typeof thread.raw !== 'object') return;
	const raw = thread.raw as Record<string, unknown>;
	if (typeof raw.mergeable_state === 'string')
		return raw.mergeable_state === 'unknown' ? undefined : raw.mergeable_state === 'dirty';
	if (typeof raw.has_conflicts === 'boolean') return raw.has_conflicts;
	if (raw.mergeable === 'CONFLICTING') return true;
	if (raw.mergeable === 'MERGEABLE') return false;
	if (typeof raw.mergeable === 'boolean') return !raw.mergeable;
}

/**
 * What else keeps an open pull request from being merged, as GitHub says: its GraphQL
 * `mergeStateStatus`, or the REST API's `mergeable_state`. Other forges don't say.
 */
function mergeStateOf(thread: Thread): string | undefined {
	if (thread.state !== 'open' || !thread.raw || typeof thread.raw !== 'object') return;
	const raw = thread.raw as { mergeStateStatus?: unknown; mergeable_state?: unknown };
	return String(raw.mergeStateStatus ?? raw.mergeable_state ?? '').toLowerCase();
}

/**
 * Whether the forge is still working out if an open pull request can be merged: GitHub's
 * `mergeable` (GraphQL) or `mergeable_state` (REST) is `unknown`, and so is the
 * `mergeStateStatus` that `mergeStateOf` reads. It says on a later ask.
 */
export function mergeUnknown(thread: Thread): boolean {
	if (thread.state !== 'open' || !thread.raw || typeof thread.raw !== 'object') return false;
	const raw = thread.raw as Record<string, unknown>;
	return [raw.mergeable, raw.mergeable_state, raw.mergeStateStatus].some(
		(value) => typeof value === 'string' && value.toLowerCase() === 'unknown'
	);
}

/**
 * A pull request read while its forge was still working out whether it can be merged
 * (`mergeUnknown`), with what was known of that before: not knowing for a moment does not
 * make it mergeable.
 */
export function withKnownMergeability(read: PullRequest, known: PullRequest | null): PullRequest {
	if (known?.number !== read.number) return read;
	const { conflicts, blocked } = known;
	return { ...(conflicts !== undefined && { conflicts }), ...(blocked && { blocked }), ...read };
}

type GitHubPull = {
	autoMergeRequest?: { enabledAt: string } | null;
	viewerCanEnableAutoMerge?: boolean;
	viewerCanDisableAutoMerge?: boolean;
	repository?: {
		squashMergeAllowed: boolean;
		mergeCommitAllowed: boolean;
		rebaseMergeAllowed: boolean;
	};
};

/** Boils a pull request down to what the workspace shows. */
export function summarise(thread: Thread, counts?: CheckCounts, items?: PullCheck[]): PullRequest {
	const reviews = thread.reviewers.map((reviewer) => reviewer.state);
	const decision = (thread.raw as { reviewDecision?: string } | null)?.reviewDecision;
	if (decision === 'APPROVED') reviews.push('approved');
	if (decision === 'CHANGES_REQUESTED') reviews.push('changes_requested');
	if (decision === 'REVIEW_REQUIRED') reviews.push('pending');
	const { checks } = thread;
	const conflicts = conflictsOf(thread);
	const mergeState = mergeStateOf(thread);
	const blocked =
		mergeState === 'blocked' ? 'rules' : mergeState === 'behind' ? 'behind' : undefined;
	const optionalChecksRunning =
		checks?.state === 'pending' &&
		(mergeState === 'clean' || mergeState === 'unstable' || mergeState === 'has_hooks');
	const raw = thread.raw as GitHubPull | null;
	return {
		number: thread.ref.number,
		title: thread.title,
		body: thread.body,
		url: thread.url ?? null,
		state: thread.state,
		draft: thread.isDraft,
		...(raw?.viewerCanEnableAutoMerge !== undefined && {
			autoMerge: {
				enabled: !!raw.autoMergeRequest,
				canEnable: raw.viewerCanEnableAutoMerge,
				canDisable: !!raw.viewerCanDisableAutoMerge
			}
		}),
		base: thread.branches?.base.ref ?? null,
		// "no checks" and "nothing known" both mean there is nothing to show
		checks:
			checks && (checks.total !== 0 || checks.state !== 'unknown')
				? {
						state: checks.state,
						...(optionalChecksRunning && { optionalChecksRunning }),
						total: checks.total ?? null,
						failed: checks.failed ?? null,
						...(counts && { counts }),
						...(items?.length && { items }),
						url: checks.url ?? null
					}
				: null,
		review:
			(['changes_requested', 'approved', 'pending'] as const).find((state) =>
				reviews.includes(state)
			) ?? null,
		...(conflicts !== undefined && { conflicts }),
		...(blocked && { blocked })
	};
}

type Repo = Parameters<ForgeProvider['threads']['list']>[0];

/** Whether a pull request is for `branch` of this very repository (a fork may have a branch of the same name). */
function isFor(thread: Thread, repo: Repo, branch: string): boolean {
	const head = thread.branches?.head;
	const ours = !head?.repo || (head.repo.owner === repo.owner && head.repo.name === repo.name);
	return head?.ref === branch && ours;
}

/** Where a repository's pull request `number` is. */
function pullRef(repo: Repo, number: string): ResolvedThreadRef {
	return { forge: repo.forge, instance: repo.instance, repo, kind: 'pull_request', number };
}

/** A pull request in full, with its checks and reviews: batched with others where the forge can. */
async function readThread(provider: ForgeProvider, ref: Thread['ref']) {
	return (
		(provider.forge === 'github' &&
		provider.authKind !== 'anonymous' &&
		provider.can('threads.getMany')
			? await readPull(provider, ref)
			: null) ?? provider.threads.get(ref)
	);
}

/** Of the pull requests for a branch, the open one if there is one, otherwise the most recent. */
function pickFor(threads: Thread[], repo: Repo, branch: string): Thread | undefined {
	const open = (thread: Thread) => (thread.state === 'open' ? 0 : 1);
	return threads
		.filter((thread) => isFor(thread, repo, branch))
		.sort((a, b) => open(a) - open(b))[0];
}

/**
 * The pull request for a branch, with its checks and reviews: the open one if there is one,
 * otherwise the most recently updated.
 *
 * `forges` has no way to ask for a branch's pull request. Signed in to GitHub, we ask its
 * GraphQL API (one request for every branch asked about at once); elsewhere we search where
 * the forge's search understands `head:<branch>` (GitHub without credentials), and otherwise
 * go through the repository's recent pull requests.
 */
async function findPull(
	provider: ForgeProvider,
	repo: Repo,
	branch: string
): Promise<Thread | null> {
	const get = (ref: Thread['ref']) => readThread(provider, ref);
	const order = { sort: 'updated', direction: 'desc' } as const;

	if (graphqlOf(provider)) {
		const same = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
		const ours = (
			await findBranchPulls(provider, { owner: repo.owner, name: repo.name, branch })
		).filter(
			(pull) =>
				same(pull.headRepositoryOwner?.login, repo.owner) &&
				same(pull.headRepository?.name, repo.name)
		);
		const found = ours.find((pull) => pull.state === 'OPEN') ?? ours[0];
		const thread = found && (await get(pullRef(repo, String(found.number))));
		return thread && isFor(thread, repo, branch) ? thread : null;
	}

	if (provider.can('search.threads')) {
		const query = { repo, kind: 'pull_request', queryRaw: `head:${branch}`, perPage: 5 } as const;
		const found = await provider.search.threads({ ...query, ...order }).page();
		const understood = !found.warnings?.some((warning) => warning.code === 'filter_unsupported');
		if (understood) {
			// Search results are summaries, and `head:` may match more than the exact branch.
			// An open pull request counts for more than one that was closed, however recently
			// someone commented on that.
			const open = (thread: Thread) => (thread.state === 'open' ? 0 : 1);
			for (const candidate of found.items.toSorted((a, b) => open(a) - open(b))) {
				const thread = await get(candidate.ref);
				if (isFor(thread, repo, branch)) return thread;
			}
			return null;
		}
	}

	let searched = 0;
	let closed: Thread | undefined;
	const recent = provider.threads.list(repo, { kind: 'pull_request', state: 'all', ...order });
	for await (const thread of recent) {
		if (isFor(thread, repo, branch)) {
			// the list is a summary; checks and reviews come with the full pull request
			if (thread.state === 'open') return get(thread.ref);
			closed ??= thread;
		}
		if (++searched >= SEARCH_LIMIT) break;
	}
	return closed ? get(closed.ref) : null;
}

/**
 * The host a remote URL points to: `https://host/…`, `ssh://user@host:22/…` or scp-like
 * `user@host:path`. `null` for a local path or `file://` URL, which no forge is behind.
 */
export function hostOf(url: string): string | null {
	const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url);
	if (scheme) {
		if (scheme[1].toLowerCase() === 'file') return null;
		try {
			return new URL(url).hostname || null;
		} catch {
			return null;
		}
	}
	// scp-like: a colon before any slash
	const scp = /^(?:[^@/:]+@)?([^/:]+):/.exec(url);
	return scp ? scp[1] : null;
}

/**
 * The host of the repository's `origin` remote, if it is one we have no provider for:
 * then there is no pull request to be had until one is configured (`FORGES_*`).
 */
export async function unknownForge(repoPath: string): Promise<string | null> {
	const remote = await quietGit(repoPath, 'remote', 'get-url', 'origin');
	const host = remote && hostOf(remote);
	if (!host) return null;
	return (await forges()).parseUrl(remote) ? null : host;
}

/** Check the same registry workspaces use. Only return safe summaries of remote errors. */
export async function checkForge(repoPath: string): Promise<ForgeDiagnostic> {
	const remote = await quietGit(repoPath, 'remote', 'get-url', 'origin').catch(() => null);
	if (!remote) {
		const remotes = await quietGit(repoPath, 'remote').catch(() => null);
		return {
			message:
				remotes !== null && !remotes.split('\n').includes('origin')
					? 'This repository has no origin remote.'
					: 'The daemon could not read the origin remote. Check the repository path.'
		};
	}
	const host = hostOf(remote);
	if (!host) return { message: 'The origin has no forge host. Check its Git remote URL.' };

	let found;
	try {
		found = (await forges()).parseUrl(remote);
	} catch {
		return {
			context: host,
			message: 'The daemon could not load its forge configuration.',
			setup: true
		};
	}
	if (!found)
		return {
			title: 'Forge not set up',
			context: host,
			message: 'Set the forge address and token in the daemon environment, then restart Geordi.',
			setup: true
		};

	const { provider, repo } = found;
	const context = [
		host,
		provider.forge,
		provider.authKind === 'anonymous' ? 'Anonymous' : 'Credentials configured'
	].join(' · ');
	try {
		await provider.repos.get(repo, { signal: AbortSignal.timeout(8000) });
		return { context, message: 'The daemon can read this repository.' };
	} catch (error) {
		if (error instanceof RateLimitedError)
			return { context, message: 'The forge rate limit was reached. Try again later.' };
		if (error instanceof ForgeApiError) {
			if (error.status === 401 || error.status === 403)
				return {
					context,
					message:
						'The forge denied access. Check the daemon credentials and repository permissions.',
					setup: true
				};
			if (error.status === 404)
				return {
					context,
					message:
						'The forge could not find this repository. Check the origin and whether the daemon credentials can read it.',
					setup: true
				};
			return {
				context,
				message: `The forge returned HTTP ${error.status} while reading this repository.`
			};
		}
		return {
			context,
			message:
				'The repository read failed. Check the forge address and the connection from the daemon.'
		};
	}
}

/**
 * Where a worktree's branch lives upstream. `null` if the repository has no `origin` remote
 * on a forge we know, or the worktree is on no branch.
 */
async function locate(worktree: Worktree, repoPath: string) {
	const remote = await quietGit(repoPath, 'remote', 'get-url', 'origin');
	if (!remote) return null;

	const all = await forges();
	const parsed = all.parseUrl(remote);
	if (!parsed) return null;

	const head = headOf(worktree);
	// a detached HEAD has no branch to have a pull request
	if (!head.startsWith('refs/heads/')) return null;
	// what the branch is called upstream, which is where its pull request is
	const branch = await upstreamBranchOf(repoPath, head.slice('refs/heads/'.length));
	return { remote, ...parsed, branch, head };
}

type Cached = {
	/** A change was made here (a merge, auto-merge, ready for review): read it again. */
	invalidated?: boolean;
	includeChecks: boolean;
	key: string;
	at: number;
	/** When the pull request was last read in full, and when the forge said it was last updated then. */
	readAt?: number;
	updatedAt?: number;
	/** How many reads in a row found its forge still working out whether it can be merged. */
	unsettled: number;
	pushedSha: string | null;
	fastUntil: number;
	value: Upstream | null;
};
const cache = new Map<string, Cached>();
/** What each worktree's last failed lookup said, so that the log says it once. */
const failures = new Map<string, string>();
/** Lookups under way, by worktree and whether with checks: calls that arrive meanwhile share them. */
const looking = new Map<string, Promise<Upstream | null>>();
const lookingKey = (id: string, includeChecks = false) => `${id} ${includeChecks}`;

/** The last known comparison target, including while a fresh lookup is in flight. */
export function cachedPullBase(id: string, branch: string | null) {
	const known = cache.get(id)?.value;
	return known?.localBranch === branch ? (known?.pull?.base ?? undefined) : undefined;
}

/**
 * After a change made here: the next look reads again, and no lookup that began before
 * answers it. Keep the comparison available until the next read replaces it.
 */
function invalidate(id: string) {
	const cached = cache.get(id);
	if (cached) cache.set(id, { ...cached, invalidated: true });
	looking.delete(lookingKey(id, false));
	looking.delete(lookingKey(id, true));
}

type Request = { repoPath: string; worktreeId: string; fresh?: boolean; includeChecks?: boolean };

/**
 * How the workspace's branch stands upstream. `null` if the repository has no `origin`
 * remote on a forge we know. Reuses an answer for as long as it says (`refreshAfterMs`).
 * Calls that arrive while a lookup is under way share it, unless asked to look afresh: an
 * answer to that must not come from a lookup that began before it.
 */
export function upstream(
	worktree: Worktree,
	request: Request,
	now = Date.now()
): Promise<Upstream | null> {
	const key = lookingKey(request.worktreeId, request.includeChecks);
	const shared = !request.fresh && looking.get(key);
	if (shared) return shared;
	const lookup = lookUpstream(worktree, request, now).finally(() => {
		if (looking.get(key) === lookup) looking.delete(key);
	});
	looking.set(key, lookup);
	return lookup;
}

async function lookUpstream(
	worktree: Worktree,
	{ repoPath, worktreeId, fresh: asked, includeChecks = false }: Request,
	now: number
): Promise<Upstream | null> {
	const found = await locate(worktree, repoPath);
	if (!found) {
		cache.delete(worktreeId);
		return null;
	}
	const { remote, provider, repo, branch } = found;
	const anonymous = provider.authKind === 'anonymous';
	const host = new URL(provider.baseUrl).host;
	const pushedSha = await quietGit(
		repoPath,
		'rev-parse',
		'--verify',
		'--quiet',
		`refs/remotes/origin/${branch}`
	);
	const pushed = pushedSha !== null;

	const local = found.head.slice('refs/heads/'.length);
	const base: Upstream = {
		localBranch: local,
		checkedAt: now,
		forge: provider.forge,
		repo: `${repo.owner}/${repo.name}`,
		repoUrl: provider.urlFor({ repo }) ?? null,
		branch,
		pushed,
		createUrl: null,
		pull: null
	};
	// A branch that is not upstream has no pull request to look for: unless it once was.
	// Forges delete a branch when its pull request is merged, and the next fetch forgets
	// it here; the pull request is still there, and still this branch's. What is left of
	// the push is that Git was told where the branch goes, or that we saw its pull request.
	const key = JSON.stringify([remote, branch, local]);
	const tracks = !pushed && (await quietGit(repoPath, 'config', '--get', `branch.${local}.remote`));
	const cached = cache.get(worktreeId);
	const baseline = cached?.key === key ? cached : undefined;
	const previous = baseline?.value;
	if (!pushed && !previous?.pull && !tracks) {
		// Remember the unpushed branch so its first push is an observed change.
		cache.set(worktreeId, {
			key,
			at: now,
			includeChecks: false,
			unsettled: 0,
			pushedSha,
			fastUntil: 0,
			value: null
		});
		return base;
	}

	// Asked to look now (something may just have happened there that nothing here shows: a
	// pull request opened, a review), we do. Not without credentials: those few requests
	// are for looking now and then. A cold read establishes the baseline; only an observed
	// push opens the window in which a branch without a pull request is looked at often.
	const sameHead = baseline?.pushedSha === pushedSha;
	const fastUntil = sameHead ? baseline.fastUntil : baseline && pushed ? now + PUSHED_MS : 0;
	const normal = previous?.refreshAfterMs ?? NO_PULL_MS;
	const fresh = anonymous ? FRESH_ANONYMOUS_MS : asked ? 0 : normal;
	if (
		cached &&
		!cached.invalidated &&
		(!includeChecks || cached.includeChecks) &&
		previous &&
		(sameHead || anonymous) &&
		previous.pushed === pushed &&
		now - cached.at < fresh
	)
		return previous;

	try {
		const paused = limits.paused(host);
		if (paused)
			throw new Error(`${host} is rate limiting us until ${new Date(paused).toISOString()}`);
		const value = await lookUp();
		failures.delete(worktreeId);
		return value;
	} catch (error) {
		// Rate limited: what we last knew will do, until the forge lets us ask again.
		if (previous && limits.paused(host)) return previous;
		const message = error instanceof Error ? error.message : String(error);
		if (failures.get(worktreeId) !== message) {
			failures.set(worktreeId, message);
			console.warn(`[upstream] Could not look up ${base.repo} ${branch}: ${message}`);
		}
		throw error;
	}

	async function lookUp(): Promise<Upstream> {
		const known = previous?.pull ?? null;
		// The repository's recently updated pull requests say whether this one changed. Asked
		// to look now, or after a change made here, a listing from before will not do.
		const listing = provider.can('threads.list')
			? await recentPulls(
					provider,
					repo,
					(asked || baseline?.invalidated) && !anonymous ? 0 : CI_REFRESH_MS,
					now
				)
			: null;
		const listed = listing && pickFor(listing.threads, repo, branch);
		// What we know must be read again anyway, whatever the listing says: what was changed
		// here; and of an open pull request, a new head (a push lists it as updated only once
		// the forge has caught up), its checks and whether it conflicts with its base, which
		// change without it counting as updated.
		const unsettled = baseline?.unsettled ?? 0;
		const due =
			!baseline?.readAt ||
			!!baseline.invalidated ||
			(includeChecks && !baseline.includeChecks) ||
			(known?.state === 'open' &&
				(!sameHead ||
					known.checks?.state === 'pending' ||
					!!known.checks?.counts?.pending ||
					(unsettled > 0 && unsettled <= UNSETTLED_READS) ||
					now - baseline.readAt >= OPEN_READ_MS));
		/** `undefined`: what we know stands. */
		let pull: Thread | null | undefined;
		if (listed) {
			const same =
				known?.number === listed.ref.number && baseline?.updatedAt === listed.updatedAt?.getTime();
			pull = same && !due ? undefined : await readThread(provider, listed.ref);
		} else if (
			asked &&
			!anonymous &&
			pushed &&
			!known &&
			(graphqlOf(provider) || provider.can('search.threads'))
		) {
			// A PR opened during this turn may not be in the repository listing yet.
			pull = await findPull(provider, repo, branch);
		} else if (listing && (listing.complete || baseline)) {
			// Not among the recently updated: there is none, or it has not changed since we read it.
			pull = !known ? null : due ? await readKnown(known.number) : undefined;
		} else pull = await findPull(provider, repo, branch);

		const reread = pull !== undefined;
		const unknown = !!pull && mergeUnknown(pull);
		const defaultBranch =
			reread &&
			!pull &&
			pushed &&
			(await quietGit(repoPath, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'));
		const checks = pull && (await checksFor(provider, repo, pull, includeChecks));
		const read = pull ? summarise(pull, checks?.counts, checks?.items) : null;
		// Not knowing for a moment whether it can be merged does not make it mergeable.
		const summary = !reread ? known : read && unknown ? withKnownMergeability(read, known) : read;
		const refreshAfterMs = anonymous
			? FRESH_ANONYMOUS_MS
			: summary?.state === 'open'
				? OPEN_MS
				: summary
					? SETTLED_MS
					: now < fastUntil
						? OPEN_MS
						: NO_PULL_MS;
		const value: Upstream = {
			...base,
			refreshAfterMs,
			pull: summary,
			createUrl: reread
				? (defaultBranch &&
						provider.urlFor({
							compare: { repo, base: defaultBranch.replace(/^origin\//, ''), head: branch }
						})) ||
					null
				: (previous?.createUrl ?? null)
		};
		// An overlapping refresh (or a merge) may have superseded this read.
		const latest = cache.get(worktreeId);
		if (latest === cached || (latest && !latest.invalidated && latest.at < now))
			cache.set(worktreeId, {
				key,
				at: now,
				includeChecks: reread ? includeChecks : !!baseline?.includeChecks,
				readAt: reread ? now : baseline?.readAt,
				updatedAt: reread ? (listed?.updatedAt ?? pull?.updatedAt)?.getTime() : baseline?.updatedAt,
				unsettled: reread ? (unknown ? unsettled + 1 : 0) : unsettled,
				value,
				pushedSha,
				fastUntil
			});
		return value;
	}

	/** The pull request we know of, read again; or, closed or retargeted, its successor. */
	async function readKnown(number: string): Promise<Thread | null> {
		const pull = await readThread(provider, pullRef(repo, number));
		return pull?.state === 'open' && isFor(pull, repo, branch)
			? pull
			: await findPull(provider, repo, branch);
	}
}

async function selectedPull(provider: ForgeProvider, repo: Repo, branch: string, number: string) {
	const pull = await readThread(provider, pullRef(repo, number));
	if (pull?.state !== 'open' || !isFor(pull, repo, branch))
		throw new Error(`Pull request #${number} is no longer open for ${branch}`);
	return pull;
}

/** Set GitHub's native auto-merge on the pull request selected in the workspace. */
export async function setAutoMerge(
	worktree: Worktree,
	{
		repoPath,
		worktreeId,
		pullNumber,
		enabled,
		confirmation
	}: {
		repoPath: string;
		worktreeId: string;
		pullNumber: string;
		enabled: boolean;
		confirmation?: string;
	},
	approved: (command: string) => boolean
) {
	const found = await locate(worktree, repoPath);
	if (!found) throw new Error('This workspace has no upstream branch');
	const { provider, repo, branch, head } = found;
	const graphql = graphqlOf(provider);
	if (!graphql) throw new Error('This forge does not support auto-merge');
	const pull = await selectedPull(provider, repo, branch, pullNumber);
	const id = pull.ref.externalId;
	if (!id) throw new Error('The forge did not return a pull request ID');
	const raw = pull.raw as GitHubPull;
	if (!!raw.autoMergeRequest !== enabled) {
		if (enabled) {
			const sha = (await gitIn(worktree, 'rev-parse', '--verify', head)).trim();
			if (pull.branches?.head.sha !== sha)
				throw new Error('Push the workspace commit before enabling auto-merge');
			if (pull.isDraft || !raw.viewerCanEnableAutoMerge)
				throw new Error('Auto-merge is unavailable for this pull request');
			const review = await reviewRelease(
				worktree,
				{
					number: pullNumber,
					head: sha,
					branch: pull.branches.base.ref,
					base: pull.branches.base.sha
				},
				approved,
				true,
				confirmation
			);
			if (review) return review;
			const methods = raw.repository;
			const method = methods?.squashMergeAllowed
				? 'SQUASH'
				: methods?.mergeCommitAllowed
					? 'MERGE'
					: methods?.rebaseMergeAllowed
						? 'REBASE'
						: null;
			if (!method) throw new Error('The repository has no available merge method');
			await graphql(
				`
					mutation EnableAutoMerge($input: EnablePullRequestAutoMergeInput!) {
						enablePullRequestAutoMerge(input: $input) {
							pullRequest {
								id
							}
						}
					}
				`,
				{ input: { pullRequestId: id, expectedHeadOid: sha, mergeMethod: method } }
			);
		} else {
			await graphql(
				`
					mutation DisableAutoMerge($id: ID!) {
						disablePullRequestAutoMerge(input: { pullRequestId: $id }) {
							pullRequest {
								id
							}
						}
					}
				`,
				{ id }
			);
		}
	}
	invalidate(worktreeId);
	return null;
}

/** Mark the open pull request the person saw ready, if it still belongs to this branch. */
export async function markReady(
	worktree: Worktree,
	{ repoPath, worktreeId, pullNumber }: { repoPath: string; worktreeId: string; pullNumber: string }
) {
	const found = await locate(worktree, repoPath);
	if (!found) throw new Error('This workspace has no branch on a forge Geordi knows');
	const { provider, repo, branch } = found;
	const pull = await provider.threads.get(pullRef(repo, pullNumber));
	await markDraftReady(provider, repo, branch, pull);
	invalidate(worktreeId);
	return null;
}

export async function markDraftReady(
	provider: ForgeProvider,
	repo: Repo,
	branch: string,
	pull: Thread
) {
	// forges has no common draft update. Its GitHub provider exposes authenticated GraphQL.
	const graphql = graphqlOf(provider);
	if (!graphql)
		throw new Error(`Geordi cannot mark pull requests ready for review on ${provider.forge}`);
	if (pull.state !== 'open' || !isFor(pull, repo, branch))
		throw new Error(`Pull request #${pull.ref.number} is no longer open for ${branch}`);
	if (pull.isDraft) {
		const id = pull.ref.externalId;
		if (!id) throw new Error('The forge did not return a pull request ID');
		await graphql(
			`
				mutation MarkReady($id: ID!) {
					markPullRequestReadyForReview(input: { pullRequestId: $id }) {
						pullRequest {
							id
						}
					}
				}
			`,
			{ id }
		);
	}
}

/** How Geordi merges where a repository allows several ways: one commit per piece of work. */
const PREFERRED: MergeMethod[] = ['squash', 'merge', 'rebase'];

/**
 * Merges a pull request, provided it is still at `sha`. Uses the repository's one way of
 * merging, or the first of `PREFERRED` that it allows.
 */
export async function merge(
	threads: Pick<ForgeProvider['threads'], 'merge'>,
	ref: Thread['ref'],
	sha: string
) {
	try {
		return await threads.merge(ref, { sha });
	} catch (error) {
		if (!(error instanceof MergeMethodRequiredError)) throw error;
		const method = PREFERRED.find((m) => error.allowed.includes(m)) ?? error.allowed[0];
		if (!method) throw error;
		return threads.merge(ref, { sha, method });
	}
}

/**
 * Merges the pull request for the workspace's branch. Only what the workspace has: the
 * pull request must be open and at the commit checked out here, so that nothing unpushed
 * is left behind and nothing unseen is merged.
 */
export async function mergePull(
	worktree: Worktree,
	{
		repoPath,
		worktreeId,
		pullNumber,
		confirmation
	}: { repoPath: string; worktreeId: string; pullNumber: string; confirmation?: string },
	approved: (command: string) => boolean
) {
	const found = await locate(worktree, repoPath);
	if (!found) throw new Error('This workspace has no branch on a forge Geordi knows');
	const { provider, repo, branch, head } = found;
	if (!provider.can('threads.merge'))
		throw new Error(`Geordi cannot merge pull requests on ${provider.forge}`);

	const pull = await selectedPull(provider, repo, branch, pullNumber);
	const commit = (await gitIn(worktree, 'rev-parse', '--verify', head)).trim();
	if (pull.branches?.head.sha !== commit)
		throw new Error('The pull request is not at the commit this workspace is at; push first');

	const review = await reviewRelease(
		worktree,
		{
			number: pull.ref.number,
			head: commit,
			branch: pull.branches.base.ref,
			base: pull.branches.base.sha
		},
		approved,
		false,
		confirmation
	);
	if (review) return review;
	const { status } = await merge(provider.threads, pull.ref, commit);
	invalidate(worktreeId);
	return status;
}
