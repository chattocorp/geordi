import { execFileSync } from 'node:child_process';
import type { PullRequest, Upstream } from '@geordi/protocol';
import {
	createForges,
	github,
	MergeMethodRequiredError,
	type ForgeProvider,
	type Forges,
	type MergeMethod,
	type Thread
} from 'forges';
import { providersFromEnv } from 'forges/env';
import { gitIn, headOf, type Worktree } from './worktree.ts';

/**
 * Talks to the forge a repository is hosted on (ADR-006), through the `forges` library so
 * that GitHub is just the first of many. Runs in the daemon: that is where the repository,
 * its remotes and the user's credentials are.
 */

/** How long an answer is reused. The forge's API is rate-limited, far more so without a token. */
const FRESH_MS = 60_000;
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

let registry: { forges: Forges; anonymous: ForgeProvider | null } | undefined;

/**
 * The forges we can talk to: every one configured through `FORGES_*` environment variables
 * (see https://forges.link/guides/environment-variables), plus github.com, signed in as
 * the GitHub CLI is, or anonymously (public repositories only).
 */
function forges() {
	if (registry) return registry;
	const providers = providersFromEnv(process.env).flatMap((set) => set.provider ?? []);

	let anonymous: ForgeProvider | null = null;
	if (!providers.some((p) => p.forge === 'github' && p.instance === 'github.com')) {
		const token = ghToken();
		const provider = github(token ? { auth: { type: 'token', token } } : {});
		if (!token) anonymous = provider;
		providers.push(provider);
	}
	return (registry = { forges: createForges(providers), anonymous });
}

/** Boils a pull request down to what the workspace shows. */
export function summarise(thread: Thread): PullRequest {
	const reviews = thread.reviewers.map((reviewer) => reviewer.state);
	const { checks } = thread;
	return {
		number: thread.ref.number,
		title: thread.title,
		url: thread.url ?? null,
		state: thread.state,
		draft: thread.isDraft,
		base: thread.branches?.base.ref ?? null,
		// "no checks" and "nothing known" both mean there is nothing to show
		checks:
			checks && (checks.total !== 0 || checks.state !== 'unknown')
				? {
						state: checks.state,
						total: checks.total ?? null,
						failed: checks.failed ?? null,
						url: checks.url ?? null
					}
				: null,
		review:
			(['changes_requested', 'approved', 'pending'] as const).find((state) =>
				reviews.includes(state)
			) ?? null
	};
}

type Repo = Parameters<ForgeProvider['threads']['list']>[0];

/** Whether a pull request is for `branch` of this very repository (a fork may have a branch of the same name). */
function isFor(thread: Thread, repo: Repo, branch: string): boolean {
	const head = thread.branches?.head;
	const ours = !head?.repo || (head.repo.owner === repo.owner && head.repo.name === repo.name);
	return head?.ref === branch && ours;
}

/**
 * The most recently updated pull request for a branch, with its checks and reviews.
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
	const order = { sort: 'updated', direction: 'desc' } as const;

	if (provider.can('search.threads')) {
		const query = { repo, kind: 'pull_request', queryRaw: `head:${branch}`, perPage: 5 } as const;
		const found = await provider.search.threads({ ...query, ...order }).page();
		const understood = !found.warnings?.some((warning) => warning.code === 'filter_unsupported');
		if (understood) {
			// search results are summaries, and `head:` may match more than the exact branch
			for (const candidate of found.items) {
				const thread = await provider.threads.get(candidate.ref);
				if (isFor(thread, repo, branch)) return thread;
			}
			return null;
		}
	}

	let searched = 0;
	const recent = provider.threads.list(repo, { kind: 'pull_request', state: 'all', ...order });
	for await (const thread of recent) {
		// the list is a summary; checks and reviews come with the full pull request
		if (isFor(thread, repo, branch)) return provider.threads.get(thread.ref);
		if (++searched >= SEARCH_LIMIT) break;
	}
	return null;
}

/**
 * Where a worktree's branch lives upstream. `null` if the repository has no `origin` remote
 * on a forge we know, or the worktree is on no branch.
 */
function locate(worktree: Worktree, repoPath: string) {
	const remote = git(repoPath, 'remote', 'get-url', 'origin');
	if (!remote) return null;

	const { forges: all, anonymous } = forges();
	const parsed = all.parseUrl(remote);
	if (!parsed) return null;

	const head = headOf(worktree);
	// a detached HEAD has no branch to have a pull request
	if (!head.startsWith('refs/heads/')) return null;
	return { remote, ...parsed, branch: head.slice('refs/heads/'.length), head, anonymous };
}

type Cached = { key: string; at: number; value: Upstream };
const cache = new Map<string, Cached>();

/**
 * How the workspace's branch stands upstream. `null` if the repository has no `origin`
 * remote on a forge we know. Asks the forge at most once a minute per workspace, and not at
 * all while the branch hasn't been pushed.
 */
export async function upstream(
	worktree: Worktree,
	{ repoPath, worktreeId }: { repoPath: string; worktreeId: string },
	now = Date.now()
): Promise<Upstream | null> {
	const found = locate(worktree, repoPath);
	if (!found) return null;
	const { remote, provider, repo, branch, anonymous } = found;
	const pushed =
		git(repoPath, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`) !== null;

	const base: Upstream = {
		forge: provider.forge,
		repo: `${repo.owner}/${repo.name}`,
		repoUrl: provider.urlFor({ repo }) ?? null,
		branch,
		pushed,
		createUrl: null,
		pull: null
	};
	if (!pushed) return base;

	// Pushing, or switching branches, changes the answer at once; otherwise reuse it for a while.
	const key = `${remote} ${branch}`;
	const cached = cache.get(worktreeId);
	const fresh = provider === anonymous ? FRESH_ANONYMOUS_MS : FRESH_MS;
	if (cached?.key === key && now - cached.at < fresh) return cached.value;

	const pull = await findPull(provider, repo, branch);
	const defaultBranch = git(repoPath, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD');
	const value: Upstream = {
		...base,
		pull: pull && summarise(pull),
		createUrl:
			(!pull &&
				defaultBranch &&
				provider.urlFor({
					compare: { repo, base: defaultBranch.replace(/^origin\//, ''), head: branch }
				})) ||
			null
	};
	cache.set(worktreeId, { key, at: now, value });
	return value;
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
	cache.delete(worktreeId); // what we knew about it is no longer true
	return status;
}
