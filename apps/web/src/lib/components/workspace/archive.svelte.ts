import { SvelteSet } from 'svelte/reactivity';
import { archiveConcerns, type Standing } from '#lib/archiving.ts';
import { problemOf } from '#lib/problem.ts';
import { archiveWorkspace, previewArchive } from '../../../routes/workspaces.remote';

/** Why archiving a workspace didn't work, by workspace. The workspace's page shows it. */
export const archiveProblems = $state<Record<string, string | undefined>>({});

/** The workspaces that are being archived right now: it takes a moment, and should show. */
export const beingArchived = new SvelteSet<string>();

export type ArchiveQuestion = {
	title: string;
	concerns: string[] | null;
	busy: boolean;
	answer(go: boolean): void;
};

export const archiving = $state<{ asking: ArchiveQuestion | null }>({ asking: null });

export async function archive(
	workspaceId: string,
	title: string,
	known?: Standing
): Promise<boolean> {
	if (archiving.asking) return false;
	delete archiveProblems[workspaceId];
	const concerns = known ? archiveConcerns(known) : [];
	const decision = Promise.withResolvers<boolean>();
	archiving.asking = {
		title,
		concerns: concerns.length ? concerns : null,
		busy: false,
		answer: decision.resolve
	};
	const question = archiving.asking;
	try {
		if (!question.concerns) {
			void previewArchive(workspaceId)
				.then((found) => {
					question.concerns = found;
				})
				.catch((error) => {
					if (archiving.asking !== question) return;
					archiveProblems[workspaceId] = problemOf(error, 'Could not check the workspace');
					question.answer(false);
				});
		}
		if (!(await decision.promise) || !question.concerns) return false;
		question.busy = true;
		beingArchived.add(workspaceId);
		await archiveWorkspace({ workspaceId, confirmed: true, discard: question.concerns.length > 0 });
		return true;
	} catch (error) {
		archiveProblems[workspaceId] = problemOf(error, 'Could not archive the workspace');
		return false;
	} finally {
		beingArchived.delete(workspaceId);
		archiving.asking = null;
	}
}
