import { SvelteSet } from 'svelte/reactivity';
import { problemOf } from '#lib/problem.ts';
import { markReady } from '../../../routes/workspaces.remote';

export const markingReady = new SvelteSet<string>();
export const reviewProblems = $state<Record<string, string | undefined>>({});

export async function readyForReview(workspaceId: string, pullNumber: string) {
	if (markingReady.has(workspaceId)) return;
	markingReady.add(workspaceId);
	delete reviewProblems[workspaceId];
	try {
		await markReady({ workspaceId, pullNumber });
	} catch (error) {
		reviewProblems[workspaceId] = problemOf(
			error,
			'Could not mark the pull request ready for review'
		);
	} finally {
		markingReady.delete(workspaceId);
	}
}
