import { SvelteMap } from 'svelte/reactivity';
import { problemOf } from '#lib/problem.ts';
import type { WorkspaceAction } from '@geordi/ui/actions';
import { enableWithReview, mergeWithReview } from './release-review.svelte.ts';
import { markReady, setAutoMerge } from '../../../routes/workspaces.remote';

export const pendingPullAction = new SvelteMap<string, WorkspaceAction['id']>();
// The command can confirm the merge before navigation or the workspace view catches up.
const mergedPull = new SvelteMap<string, string>();

export function pullActionPending(workspaceId: string, action: WorkspaceAction) {
	return (
		!!action.pullNumber &&
		(pendingPullAction.has(workspaceId) ||
			(action.id === 'merge-pull' && mergedPull.get(workspaceId) === action.pullNumber))
	);
}
export const reviewProblems = $state<Record<string, string | undefined>>({});

export async function runPullAction(workspaceId: string, action: WorkspaceAction) {
	const { pullNumber } = action;
	if (!pullNumber) return;
	if (pullActionPending(workspaceId, action)) return;
	pendingPullAction.set(workspaceId, action.id);
	delete reviewProblems[workspaceId];
	try {
		if (action.id === 'merge-pull') {
			const result = await mergeWithReview(workspaceId, pullNumber);
			if (result === 'merged') mergedPull.set(workspaceId, pullNumber);
			return;
		}
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
