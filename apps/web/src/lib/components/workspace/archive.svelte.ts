import { SvelteSet } from 'svelte/reactivity';
import { problemOf } from '#lib/problem.ts';
import { archiveWorkspace, previewArchive } from '../../../routes/workspaces.remote';

/** Why archiving a workspace didn't work, by workspace. The workspace's page shows it. */
export const archiveProblems = $state<Record<string, string | undefined>>({});

/** The workspaces that are being archived right now: it takes a moment, and should show. */
export const beingArchived = new SvelteSet<string>();

export type ArchiveQuestion = {
	title: string;
	concerns: string[];
	blocked: boolean;
	busy: boolean;
	answer(go: boolean): void;
};

export const archiving = $state<{ asking: ArchiveQuestion | null }>({ asking: null });

export async function archive(workspaceId: string, title: string): Promise<boolean> {
	if (beingArchived.size) return false;
	delete archiveProblems[workspaceId];
	beingArchived.add(workspaceId);
	try {
		const { concerns, discard, blocked } = await previewArchive(workspaceId);
		if (concerns.length) {
			const decision = Promise.withResolvers<boolean>();
			archiving.asking = { title, concerns, blocked, busy: false, answer: decision.resolve };
			if (!(await decision.promise) || blocked) return false;
			archiving.asking.busy = true;
		}
		await archiveWorkspace({ workspaceId, discard });
		return true;
	} catch (error) {
		archiveProblems[workspaceId] = problemOf(error, 'Could not archive the workspace');
		return false;
	} finally {
		beingArchived.delete(workspaceId);
		archiving.asking = null;
	}
}
