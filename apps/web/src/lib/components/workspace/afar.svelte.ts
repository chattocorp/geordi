import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { navigating, page } from '$app/state';
import type { WorkspaceAction } from '@geordi/ui/actions';
import { problemOf } from '#lib/problem.ts';
import { archive, archiveProblems } from './archive.svelte.ts';
import { reviewProblems, runPullAction } from './review.svelte.ts';
import {
	continueWorkspace,
	say,
	setWorkspaceInactive,
	updateWorkspace
} from '../../../routes/workspaces.remote';

/**
 * Doing what a workspace's actions say from outside it: the sidebar. Where
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

/**
 * Marks a workspace inactive or active. One marked inactive while it is on screen and only
 * active workspaces are listed (`hiding`) is left at once, as an archived one is: for the
 * one whose agent started it, or the start page.
 */
export async function setInactive(workspace: Target, inactive: boolean, hiding: boolean) {
	if (inactive && hiding && page.url.pathname === resolve('/workspaces/[id]', { id: workspace.id }))
		void goto(
			workspace.parentId ? resolve('/workspaces/[id]', { id: workspace.parentId }) : resolve('/')
		);
	await setWorkspaceInactive({ workspaceId: workspace.id, inactive });
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
	if (action.prompt)
		return say({ workspaceId: workspace.id, text: action.prompt, action: action.id });
	// restoring a worktree, say: that is done in the workspace
	return open(workspace.id);
}
