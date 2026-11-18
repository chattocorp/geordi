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

const questions = $state<ArchiveQuestion[]>([]);
export const archiving = {
	get asking() {
		return questions[0] ?? null;
	}
};

export async function archive(workspaceId: string, title: string): Promise<boolean> {
	if (beingArchived.has(workspaceId)) return false;
	delete archiveProblems[workspaceId];
	beingArchived.add(workspaceId);
	let hasQuestion = false;
	try {
		const { concerns, discard, blocked } = await previewArchive(workspaceId);
		if (concerns.length) {
			const decision = Promise.withResolvers<boolean>();
			questions.push({ title, concerns, blocked, busy: false, answer: decision.resolve });
			hasQuestion = true;
			if (!(await decision.promise) || blocked) return false;
			questions[0].busy = true;
		}
		await archiveWorkspace({ workspaceId, discard });
		return true;
	} catch (error) {
		archiveProblems[workspaceId] = problemOf(error, 'Could not archive the workspace');
		return false;
	} finally {
		beingArchived.delete(workspaceId);
		if (hasQuestion) questions.shift();
	}
}
