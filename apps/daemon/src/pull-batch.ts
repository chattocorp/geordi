import { setTimeout as delay } from 'node:timers/promises';
import {
	RateLimitedError,
	threadKey,
	type ForgeProvider,
	type GitHubProvider,
	type ResolvedThreadRef,
	type Thread
} from 'forges';
import type { PullRequest } from '@geordi/protocol';

/**
 * Calls that arrive together (over the daemon socket, within 20ms) share one call of `run`
 * per provider, which answers for each of their items in order. Calls with the same key
 * share an item.
 */
function batched<T, R>(run: (provider: ForgeProvider, items: T[]) => Promise<R[]>) {
	type Batch = { items: Map<string, T>; results: Promise<Map<string, R>> };
	const queues = new WeakMap<ForgeProvider, Batch>();
	return async (provider: ForgeProvider, key: string, item: T): Promise<R> => {
		let batch = queues.get(provider);
		if (!batch) {
			const items = new Map<string, T>();
			const results = delay(20).then(async () => {
				queues.delete(provider);
				const results = await run(provider, [...items.values()]);
				return new Map([...items.keys()].map((key, i) => [key, results[i]]));
			});
			batch = { items, results };
			queues.set(provider, batch);
		}
		batch.items.set(key, item);
		return (await batch.results).get(key)!;
	};
}

const getMany = batched((provider, refs: ResolvedThreadRef[]) => provider.threads.getMany(refs));

export async function readPull(
	provider: ForgeProvider,
	ref: ResolvedThreadRef
): Promise<Thread | null> {
	const result = await getMany(provider, threadKey(ref), ref);
	if (result.ok) return result.thread;
	if (result.warning.code === 'thread_unreadable') return null;
	throw new Error(result.warning.message);
}

/** GitHub's GraphQL API, where we may use it: signed in. */
export function graphqlOf(provider: ForgeProvider): GitHubProvider['graphql'] | null {
	return provider.forge === 'github' &&
		provider.authKind !== 'anonymous' &&
		'graphql' in provider &&
		typeof provider.graphql === 'function'
		? (provider as GitHubProvider).graphql
		: null;
}

/** A pull request for a branch, as GitHub names it: from any repository, a fork's too. */
export type BranchPull = {
	number: number;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	headRepositoryOwner: { login: string } | null;
	headRepository: { name: string } | null;
};
type Branch = { owner: string; name: string; branch: string };

/** One request for the pull requests of several branches, the most recently updated first. */
async function queryBranches(provider: ForgeProvider, branches: Branch[]) {
	const params = branches.map((_, i) => `$o${i}: String!, $n${i}: String!, $b${i}: String!`);
	const fields = branches.map(
		(_, i) => `r${i}: repository(owner: $o${i}, name: $n${i}) {
			pullRequests(headRefName: $b${i}, first: 5, orderBy: { field: UPDATED_AT, direction: DESC }) {
				nodes { number state headRepositoryOwner { login } headRepository { name } }
			}
		}`
	);
	const variables = Object.fromEntries(
		branches.flatMap(({ owner, name, branch }, i) => [
			[`o${i}`, owner],
			[`n${i}`, name],
			[`b${i}`, branch]
		])
	);
	type Data = Record<string, { pullRequests: { nodes: BranchPull[] } } | null>;
	const data = await graphqlOf(provider)!<Data>(
		`query BranchPulls(${params.join(', ')}) { ${fields.join('\n')} }`,
		variables
	);
	return branches.map((_, i) => data[`r${i}`]?.pullRequests.nodes ?? []);
}

const findMany = batched(
	async (provider, branches: Branch[]): Promise<(BranchPull[] | Error)[]> => {
		try {
			return await queryBranches(provider, branches);
		} catch (error) {
			// One repository that cannot be read fails the whole request: then each is asked
			// alone. Not when refused for asking too much, which asking more would not help.
			if (branches.length === 1 || error instanceof RateLimitedError)
				return branches.map(() => error as Error);
			return Promise.all(
				branches.map((branch) =>
					queryBranches(provider, [branch]).then(
						([pulls]) => pulls,
						(error: Error) => error
					)
				)
			);
		}
	}
);

/**
 * A branch's pull requests on GitHub, the most recently updated first: one GraphQL request
 * for every branch asked about at once. The GraphQL API has a budget of its own, much
 * larger than search's (30 a minute).
 */
export async function findBranchPulls(
	provider: ForgeProvider,
	branch: Branch
): Promise<BranchPull[]> {
	const result = await findMany(provider, JSON.stringify(branch), branch);
	if (result instanceof Error) throw result;
	return result;
}

type Count = { state: string; count: number };
type Rollup = {
	totalCount: number;
	checkRunCountsByState: Count[];
	statusContextCountsByState: Count[];
};

/** GitHub includes grouped check counts in the batch response, alongside the combined state. */
export function rollupCounts(thread: Thread): NonNullable<PullRequest['checks']>['counts'] {
	const raw = thread.raw as {
		commits?: { nodes?: { commit: { statusCheckRollup?: { contexts: Rollup } | null } }[] };
	} | null;
	const contexts = raw?.commits?.nodes?.[0]?.commit.statusCheckRollup?.contexts;
	if (!contexts || thread.checks?.failed == null) return;
	const states = [...contexts.checkRunCountsByState, ...contexts.statusContextCountsByState];
	const counts = { passed: 0, pending: 0, failed: thread.checks.failed, skipped: 0 };
	for (const { state, count } of states) {
		if (state === 'SUCCESS') counts.passed += count;
		if (['EXPECTED', 'PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED'].includes(state))
			counts.pending += count;
	}
	counts.skipped = contexts.totalCount - counts.passed - counts.pending - counts.failed;
	return counts;
}
