import { SvelteSet } from 'svelte/reactivity';
import { problemOf } from '#lib/problem.ts';
import type { WorkspaceAction } from '#lib/actions.ts';
import { enableWithReview, mergeWithReview } from './release-review.svelte.ts';
import { markReady, setAutoMerge } from '../../../routes/workspaces.remote';

export const pendingPullAction = new SvelteSet<string>();
export const reviewProblems = $state<Record<string, string | undefined>>({});

export async function runPullAction(workspaceId: string, action: WorkspaceAction) {
	const { pullNumber } = action;
	if (!pullNumber) return;
	if (pendingPullAction.has(workspaceId)) return;
	pendingPullAction.add(workspaceId);
	delete reviewProblems[workspaceId];
	try {
		if (action.id === 'merge-pull') return await mergeWithReview(workspaceId, pullNumber);
		if (action.id === 'ready-for-review') await markReady({ workspaceId, pullNumber });
		else if (action.id === 'enable-auto-merge') await enableWithReview(workspaceId, pullNumber);
		else if (action.id === 'cancel-auto-merge')
			await setAutoMerge({ workspaceId, pullNumber, enabled: false });
	} catch (error) {
		reviewProblems[workspaceId] = problemOf(error, `Could not complete “${action.label}”`);
	} finally {
		pendingPullAction.delete(workspaceId);
	}
}
