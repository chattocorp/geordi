import type { ForgeProvider, Thread, ThreadRef } from 'forges';
import type { PullRequest } from '@geordi/protocol';

/** Collect requests from the forge's refresh tick as they arrive over the daemon socket. */
type Read = {
	ref: ThreadRef;
	resolve: (thread: Thread | null) => void;
	reject: (error: unknown) => void;
};
const queues = new WeakMap<ForgeProvider, Read[]>();

export function readPull(provider: ForgeProvider, ref: ThreadRef): Promise<Thread | null> {
	return new Promise((resolve, reject) => {
		const read = { ref, resolve, reject };
		const pending = queues.get(provider);
		if (pending) {
			pending.push(read);
			return;
		}
		const batch = [read];
		queues.set(provider, batch);
		setTimeout(async () => {
			queues.delete(provider);
			try {
				const results = await provider.threads.getMany(batch.map(({ ref }) => ref));
				for (const [i, result] of results.entries()) {
					if (result.ok) batch[i].resolve(result.thread);
					else if (result.warning.code === 'thread_unreadable') batch[i].resolve(null);
					else batch[i].reject(new Error(result.warning.message));
				}
			} catch (error) {
				for (const read of batch) read.reject(error);
			}
		}, 20);
	});
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
