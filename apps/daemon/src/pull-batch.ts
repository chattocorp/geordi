import { setTimeout as delay } from 'node:timers/promises';
import {
	threadKey,
	type ForgeProvider,
	type GetManyResult,
	type ResolvedThreadRef,
	type Thread
} from 'forges';
import type { PullRequest } from '@geordi/protocol';

/** Requests that arrive together over the daemon socket share one provider call. */
type Batch = { refs: Map<string, ResolvedThreadRef>; results: Promise<Map<string, GetManyResult>> };
const queues = new WeakMap<ForgeProvider, Batch>();

export async function readPull(
	provider: ForgeProvider,
	ref: ResolvedThreadRef
): Promise<Thread | null> {
	let batch = queues.get(provider);
	if (!batch) {
		const refs = new Map<string, ResolvedThreadRef>();
		const results = delay(20).then(async () => {
			queues.delete(provider);
			const results = await provider.threads.getMany([...refs.values()]);
			return new Map([...refs.keys()].map((key, i) => [key, results[i]]));
		});
		batch = { refs, results };
		queues.set(provider, batch);
	}

	const key = threadKey(ref);
	batch.refs.set(key, ref);
	const result = (await batch.results).get(key)!;
	if (result.ok) return result.thread;
	if (result.warning.code === 'thread_unreadable') return null;
	throw new Error(result.warning.message);
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
