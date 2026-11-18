import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { navigating, page } from '$app/state';
import type { WorkspaceAction } from '#lib/actions.ts';
import { problemOf } from '#lib/problem.ts';
import { archive, archiveProblems } from './archive.svelte.ts';
import { reviewProblems, runPullAction } from './review.svelte.ts';
import {
	continueWorkspace,
	mergePull,
	say,
	updateWorkspace
} from '../../../routes/workspaces.remote';

/**
 * Doing what a workspace's actions say from outside it: the sidebar, the overview. Where
 * something goes wrong, the workspace's page is where it says why, so we go there.
 */

type Target = { id: string; title: string; parentId: string | null };

const open = (id: string) => goto(resolve('/workspaces/[id]', { id }));

/** Archives a workspace, wherever we are. */
export async function archiveAndNavigate(workspace: Target) {
	const href = resolve('/workspaces/[id]', { id: workspace.id });
	const startedAt = page.url.pathname;
	const archived = await archive(workspace.id, workspace.title);
	if (navigating.to) return;
	if (archived) {
		// from a workspace an agent started, back to the one whose agent started it
		if (page.url.pathname === href)
			await goto(
				workspace.parentId ? resolve('/workspaces/[id]', { id: workspace.parentId }) : resolve('/')
			);
	}
	// it didn't work (rather than: they said no): the workspace's page says why
	else if (archiveProblems[workspace.id] && page.url.pathname === startedAt && startedAt !== href)
		await goto(href);
}

/** Has a workspace carry on with new work, on a new branch off the latest upstream. */
export async function continueFromAfar(workspace: Target) {
	delete archiveProblems[workspace.id];
	try {
		await continueWorkspace(workspace.id);
	} catch (error) {
		archiveProblems[workspace.id] = problemOf(error, 'Could not continue the workspace');
		await open(workspace.id);
	}
}

/** Does what one of a workspace's actions says. */
export async function actFromAfar(workspace: Target, action: WorkspaceAction) {
	if (action.id === 'archive') return archiveAndNavigate(workspace);
	if (action.id === 'continue') return continueFromAfar(workspace);
	if (action.pullNumber) {
		await runPullAction(workspace.id, action);
		if (reviewProblems[workspace.id]) await open(workspace.id);
		return;
	}
	if (action.id === 'merge-upstream' && action.prompt)
		return updateWorkspace({ workspaceId: workspace.id, prompt: action.prompt });
	if (action.prompt) return say({ workspaceId: workspace.id, text: action.prompt });
	// restoring a worktree, say: that is done in the workspace
	if (action.id !== 'merge-pull') return open(workspace.id);
	try {
		await mergePull(workspace.id);
	} catch {
		// its page offers it again, and says why it didn't work
		await open(workspace.id);
	}
}
