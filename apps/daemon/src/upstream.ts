import { execFileSync } from 'node:child_process';
import {
	CI_REFRESH_MS,
	type CheckCounts,
	type PullCheck,
	type PullRequest,
	type Upstream
} from '@geordi/protocol';
import {
	createForges,
	github,
	MergeMethodRequiredError,
	type Check,
	type ForgeProvider,
	type Forges,
	type MergeMethod,
	type Thread
} from 'forges';
import { providersFromEnv } from 'forges/env';
import { readPull, rollupCounts } from './pull-batch.ts';
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
 * a push or another branch is noticed here without asking.
 */
const OPEN_MS = CI_REFRESH_MS;
const NO_PULL_MS = 20_000;
const SETTLED_MS = 60_000;
/**
 * How often an open pull request is read in full though the listing says it is unchanged:
 * whether it conflicts with its base changes when the base moves, which does not count as
 * an update of the pull request.
 */
const OPEN_READ_MS = 60_000;
/**
 * How fresh an answer has to be for someone who asked to look now: all but this moment's.
 * (Longer, and what an agent did just before its turn ended is missed: it pushes, which has
 * us look, opens the pull request a few seconds later, and is done.)
 */
const FRESH_WHEN_ASKED_MS = 1_000;
const FRESH_ANONYMOUS_MS = 5 * 60_000;
/** How many of a repository's most recently updated pull requests are gone through for the branch. */
const SEARCH_LIMIT = 100;

const git = (cwd: string, ...args: string[]): string | null => {
	try {
		return execFileSync('git', ['-C', cwd, ...args], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return null;
	}
};

/** The token the GitHub CLI is signed in with, if it is installed and signed in. */
function ghToken(): string | null {
	try {
		const token = execFileSync('gh', ['auth', 'token'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			timeout: 5000
		}).trim();
		return token || null;
	} catch {
		return null;
	}
}

/** Every request to a forge goes through this, so that its rate limits pause our reads. */
const limits = createRateLimits();
const recentPulls = createRecentPulls();

let registry: { forges: Forges; at: number } | undefined;
/** How long credentials are trusted: signing in to the GitHub CLI should not take a restart to notice. */
const CREDENTIALS_MS = 10 * 60_000;

/**
 * The forges we can talk to: every one configured through `FORGES_*` environment variables
 * (see https://forges.link/guides/environment-variables), plus github.com, signed in as
 * the GitHub CLI is, or anonymously (public repositories only).
 */
function forges() {
	if (registry && Date.now() - registry.at < CREDENTIALS_MS) return registry;
	const providers = providersFromEnv(process.env, { fetch: limits.fetch }).flatMap(
		(set) => set.provider ?? []
	);

	if (!providers.some((p) => p.forge === 'github' && p.instance === 'github.com')) {
		const token = ghToken();
		const provider = github({
			fetch: limits.fetch,
			...(token && { auth: { type: 'token', token } as const })
		});
		providers.push(provider);
	}
	return (registry = { forges: createForges(providers), at: Date.now() });
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
					? page.items.map(({ ref, name, state, stateRaw, conclusionRaw, url }) => ({
							id: ref.type + '/' + ref.id,
							name,
							state,
							status: (conclusionRaw || stateRaw).toLowerCase(),
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
		...(conflicts !== undefined && { conflicts })
	};
}

type Repo = Parameters<ForgeProvider['threads']['list']>[0];

/** Whether a pull request is for `branch` of this very repository (a fork may have a branch of the same name). */
function isFor(thread: Thread, repo: Repo, branch: string): boolean {
	const head = thread.branches?.head;
	const ours = !head?.repo || (head.repo.owner === repo.owner && head.repo.name === repo.name);
	return head?.ref === branch && ours;
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
 * `forges` has no way to ask for a branch's pull request, so we search for it where the
 * forge's search understands `head:<branch>` (GitHub; one quick request), and otherwise go
 * through the repository's recent pull requests (slow on GitHub, hence the search).
 */
async function findPull(
	provider: ForgeProvider,
	repo: Repo,
	branch: string
): Promise<Thread | null> {
	const get = (ref: Thread['ref']) => readThread(provider, ref);
	const order = { sort: 'updated', direction: 'desc' } as const;

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
 * Where a worktree's branch lives upstream. `null` if the repository has no `origin` remote
 * on a forge we know, or the worktree is on no branch.
 */
function locate(worktree: Worktree, repoPath: string) {
	const remote = git(repoPath, 'remote', 'get-url', 'origin');
	if (!remote) return null;

	const { forges: all } = forges();
	const parsed = all.parseUrl(remote);
	if (!parsed) return null;

	const head = headOf(worktree);
	// a detached HEAD has no branch to have a pull request
	if (!head.startsWith('refs/heads/')) return null;
	// what the branch is called upstream, which is where its pull request is
	const branch = upstreamBranchOf(repoPath, head.slice('refs/heads/'.length));
	return { remote, ...parsed, branch, head };
}

type Cached = {
	invalidated?: boolean;
	includeChecks: boolean;
	key: string;
	at: number;
	/** When the pull request was last read in full, and when the forge said it was last updated then. */
	readAt?: number;
	updatedAt?: number;
	pushedSha: string | null;
	fastUntil: number;
	value: Upstream | null;
};
const cache = new Map<string, Cached>();

/** The last known comparison target, including while a fresh lookup is in flight. */
export function cachedPullBase(id: string, branch: string | null) {
	const known = cache.get(id)?.value;
	return known?.localBranch === branch ? (known?.pull?.base ?? undefined) : undefined;
}

/** Keep the comparison available until the next read replaces it. */
function invalidate(id: string) {
	const cached = cache.get(id);
	if (cached) cache.set(id, { ...cached, invalidated: true });
}

/**
 * How the workspace's branch stands upstream. `null` if the repository has no `origin`
 * remote on a forge we know. Reuses recent answers, with a shorter lifetime while checks run.
 */
export async function upstream(
	worktree: Worktree,
	{
		repoPath,
		worktreeId,
		fresh: asked,
		includeChecks = false
	}: { repoPath: string; worktreeId: string; fresh?: boolean; includeChecks?: boolean },
	now = Date.now()
): Promise<Upstream | null> {
	const found = locate(worktree, repoPath);
	if (!found) {
		cache.delete(worktreeId);
		return null;
	}
	const { remote, provider, repo, branch } = found;
	const anonymous = provider.authKind === 'anonymous';
	const pushedSha = git(
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
	const cached = cache.get(worktreeId);
	const baseline = cached?.key === key ? cached : undefined;
	const previous = baseline?.value;
	if (!pushed && !previous?.pull && !git(repoPath, 'config', '--get', `branch.${local}.remote`)) {
		// Remember the unpushed branch so its first push is an observed change.
		cache.set(worktreeId, {
			key,
			at: now,
			includeChecks: false,
			pushedSha,
			fastUntil: 0,
			value: null
		});
		return base;
	}

	// Asked to look now (something may just have happened there that nothing here shows: a
	// pull request opened, a review), we do, unless we only just did. Not without
	// credentials: those few requests are for looking now and then.
	// A cold read establishes the baseline. Only an observed push opens a discovery window.
	const sameHead = baseline?.pushedSha === pushedSha;
	const fastUntil = sameHead ? baseline.fastUntil : baseline && pushed ? now + 60_000 : 0;
	const normal = previous?.refreshAfterMs ?? NO_PULL_MS;
	const fresh = anonymous ? FRESH_ANONYMOUS_MS : asked ? FRESH_WHEN_ASKED_MS : normal;
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
	// Rate limited: what we last knew will do, until the forge lets us ask again.
	const paused = limits.paused();
	if (paused) {
		if (previous) return previous;
		throw new Error(
			`${provider.forge} is rate limiting us until ${new Date(paused).toISOString()}`
		);
	}

	try {
		return await lookUp();
	} catch (error) {
		// refused for asking too much: what we last knew will do
		if (previous && limits.paused()) return previous;
		throw error;
	}

	async function lookUp(): Promise<Upstream> {
		const known = previous?.pull ?? null;
		// The repository's recently updated pull requests say whether this one changed.
		const listing = provider.can('threads.list')
			? await recentPulls(provider, repo, asked ? FRESH_WHEN_ASKED_MS : CI_REFRESH_MS, now)
			: null;
		const listed = listing && pickFor(listing.threads, repo, branch);
		// What we know must be read again anyway: checks change without the pull request
		// counting as updated, and so does whether it conflicts with its base.
		const due =
			!baseline?.readAt ||
			(includeChecks && !baseline.includeChecks) ||
			(known?.state === 'open' &&
				(known.checks?.state === 'pending' ||
					!!known.checks?.counts?.pending ||
					now - baseline.readAt >= OPEN_READ_MS));
		/** `undefined`: what we know stands. */
		let pull: Thread | null | undefined;
		if (listed) {
			const same =
				known?.number === listed.ref.number && baseline?.updatedAt === listed.updatedAt?.getTime();
			pull = same && !due ? undefined : await readThread(provider, listed.ref);
		} else if (listing && (listing.complete || baseline)) {
			// Not among the recently updated: there is none, or it has not changed since we read it.
			pull = !known ? null : due ? await readKnown(known.number) : undefined;
		} else pull = await findPull(provider, repo, branch);

		const reread = pull !== undefined;
		const defaultBranch =
			reread &&
			!pull &&
			pushed &&
			git(repoPath, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD');
		const checks = pull && (await checksFor(provider, repo, pull, includeChecks));
		const summary = !reread ? known : pull ? summarise(pull, checks?.counts, checks?.items) : null;
		const waiting =
			summary?.state === 'open' &&
			(summary.checks?.state === 'pending' || !!summary.checks?.counts?.pending);
		const refreshAfterMs = anonymous
			? FRESH_ANONYMOUS_MS
			: waiting || (now < fastUntil && (!summary || summary.state === 'open'))
				? CI_REFRESH_MS
				: !summary
					? NO_PULL_MS
					: summary.state === 'open'
						? OPEN_MS
						: SETTLED_MS;
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
				value,
				pushedSha,
				fastUntil
			});
		return value;
	}

	/** The pull request we know of, read again; or, closed or retargeted, its successor. */
	async function readKnown(number: string): Promise<Thread | null> {
		const ref = {
			forge: repo.forge,
			instance: repo.instance,
			repo,
			kind: 'pull_request' as const,
			number
		};
		const pull = await readThread(provider, ref);
		return pull?.state === 'open' && isFor(pull, repo, branch)
			? pull
			: findPull(provider, repo, branch);
	}
}

/** Set GitHub's native auto-merge on the pull request selected in the workspace. */
export async function setAutoMerge(
	worktree: Worktree,
	{
		repoPath,
		worktreeId,
		pullNumber,
		enabled
	}: { repoPath: string; worktreeId: string; pullNumber: string; enabled: boolean }
) {
	const found = locate(worktree, repoPath);
	if (!found) throw new Error('This workspace has no upstream branch');
	const { provider, repo, branch, head } = found;
	if (
		provider.forge !== 'github' ||
		!('graphql' in provider) ||
		typeof provider.graphql !== 'function'
	)
		throw new Error('This forge does not support auto-merge');
	const pull = await readPull(provider, {
		forge: provider.forge,
		instance: provider.instance,
		repo,
		kind: 'pull_request',
		number: pullNumber
	});
	if (pull?.state !== 'open' || !isFor(pull, repo, branch))
		throw new Error(`Pull request #${pullNumber} is no longer open for ${branch}`);
	const id = pull.ref.externalId;
	if (!id) throw new Error('The forge did not return a pull request ID');
	const raw = pull.raw as GitHubPull;
	if (!!raw.autoMergeRequest !== enabled) {
		if (enabled) {
			const sha = gitIn(worktree, 'rev-parse', '--verify', head).trim();
			if (pull.branches?.head.sha !== sha)
				throw new Error('Push the workspace commit before enabling auto-merge');
			if (pull.isDraft || !raw.viewerCanEnableAutoMerge)
				throw new Error('Auto-merge is unavailable for this pull request');
			const methods = raw.repository;
			const method = methods?.squashMergeAllowed
				? 'SQUASH'
				: methods?.mergeCommitAllowed
					? 'MERGE'
					: methods?.rebaseMergeAllowed
						? 'REBASE'
						: null;
			if (!method) throw new Error('The repository has no available merge method');
			await provider.graphql(
				`mutation EnableAutoMerge($input: EnablePullRequestAutoMergeInput!) {
				enablePullRequestAutoMerge(input: $input) { pullRequest { id } }
			}`,
				{ input: { pullRequestId: id, expectedHeadOid: sha, mergeMethod: method } }
			);
		} else {
			await provider.graphql(
				`mutation DisableAutoMerge($id: ID!) {
				disablePullRequestAutoMerge(input: {pullRequestId: $id}) { pullRequest { id } }
			}`,
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
	const found = locate(worktree, repoPath);
	if (!found) throw new Error('This workspace has no branch on a forge Geordi knows');
	const { provider, repo, branch } = found;
	const pull = await provider.threads.get({
		forge: provider.forge,
		instance: provider.instance,
		repo,
		kind: 'pull_request',
		number: pullNumber
	});
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
	if (
		provider.forge !== 'github' ||
		!('graphql' in provider) ||
		typeof provider.graphql !== 'function'
	)
		throw new Error(`Geordi cannot mark pull requests ready for review on ${provider.forge}`);
	if (pull.state !== 'open' || !isFor(pull, repo, branch))
		throw new Error(`Pull request #${pull.ref.number} is no longer open for ${branch}`);
	if (pull.isDraft) {
		const id = pull.ref.externalId;
		if (!id) throw new Error('The forge did not return a pull request ID');
		await provider.graphql(
			`mutation MarkReady($id: ID!) {
				markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { id } }
			}`,
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
	{ repoPath, worktreeId }: { repoPath: string; worktreeId: string }
): Promise<'merged' | 'queued'> {
	const found = locate(worktree, repoPath);
	if (!found) throw new Error('This workspace has no branch on a forge Geordi knows');
	const { provider, repo, branch, head } = found;
	if (!provider.can('threads.merge'))
		throw new Error(`Geordi cannot merge pull requests on ${provider.forge}`);

	const pull = await findPull(provider, repo, branch);
	if (pull?.state !== 'open') throw new Error(`There is no open pull request for ${branch}`);
	const commit = gitIn(worktree, 'rev-parse', '--verify', head).trim();
	if (pull.branches?.head.sha !== commit)
		throw new Error('The pull request is not at the commit this workspace is at; push first');

	const { status } = await merge(provider.threads, pull.ref, commit);
	invalidate(worktreeId);
	return status;
}
