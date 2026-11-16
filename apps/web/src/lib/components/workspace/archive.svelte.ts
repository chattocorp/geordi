import { SvelteSet } from 'svelte/reactivity';
import { archiveConcerns, type Standing } from '#lib/archiving.ts';
import { problemOf } from '#lib/problem.ts';
import { archiveWorkspace } from '../../../routes/workspaces.remote';

/** Why archiving a workspace didn't work, by workspace. The workspace's page shows it. */
export const archiveProblems = $state<Record<string, string | undefined>>({});

/** The workspaces that are being archived right now: it takes a moment, and should show. */
export const beingArchived = new SvelteSet<string>();

/**
 * A workspace someone wants to archive that has unfinished work: what is unfinished about
 * it, for them to agree to. `ArchiveConfirm` (in the layout) asks, and shows the archiving
 * once they have (`busy`).
 */
export const archiving = $state<{
	asking: {
		workspaceId: string;
		concerns: string[];
		busy: boolean;
		answer(go: boolean): void;
	} | null;
}>({ asking: null });

/**
 * Archives a workspace, after asking if it has unfinished work. Returns whether it did. If
 * it didn't and nobody said no, the reason is in `archiveProblems`.
 *
 * `known` is how the workspace stands, where the caller is looking at it already: then
 * the question is there at once, rather than after a word with the daemon.
 */
export async function archive(workspaceId: string, known?: Standing): Promise<boolean> {
	delete archiveProblems[workspaceId];
	archiving.asking?.answer(false); // one question at a time
	try {
		let concerns = known ? archiveConcerns(known) : [];
		if (concerns.length === 0) {
			// nothing unfinished that we know of: the server looks, and archives if it agrees
			beingArchived.add(workspaceId);
			const outcome = await archiveWorkspace({ workspaceId });
			if (outcome.archived) return true;
			beingArchived.delete(workspaceId);
			concerns = outcome.concerns;
		}

		const go = await new Promise<boolean>((answer) => {
			archiving.asking = { workspaceId, concerns, busy: false, answer };
		});
		if (!go) return false;
		// the question stays, as the place where the archiving shows
		if (archiving.asking) archiving.asking.busy = true;
		beingArchived.add(workspaceId);
		await archiveWorkspace({ workspaceId, confirmed: true });
		return true;
	} catch (error) {
		archiveProblems[workspaceId] = problemOf(error, 'Could not archive the workspace');
		return false;
	} finally {
		beingArchived.delete(workspaceId);
		if (archiving.asking?.workspaceId === workspaceId) archiving.asking = null;
	}
}
