import { problemOf } from '#lib/problem.ts';
import { archiveWorkspace } from '../../../routes/workspaces.remote';

/**
 * Why archiving a workspace didn't work, by workspace: usually work that would be lost.
 * The workspace's page shows it, and offers to discard the work.
 */
export const archiveProblems = $state<Record<string, string | undefined>>({});

/** Archives a workspace. Returns whether it did; if not, the reason is in `archiveProblems`. */
export async function archive(workspaceId: string, discard = false): Promise<boolean> {
	delete archiveProblems[workspaceId];
	try {
		await archiveWorkspace({ workspaceId, discard });
		return true;
	} catch (error) {
		archiveProblems[workspaceId] = problemOf(error, 'Could not archive the workspace');
		return false;
	}
}
