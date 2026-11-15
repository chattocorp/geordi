import { isHttpError } from '@sveltejs/kit';
import { problemOf } from '#lib/problem.ts';
import { archiveWorkspace } from '../../../routes/workspaces.remote';

/**
 * Why archiving a workspace didn't work, by workspace. The workspace's page shows it.
 * `discardable` if it is work that would be lost (the server says 422), which the user may
 * decide to lose.
 */
export const archiveProblems = $state<
	Record<string, { message: string; discardable: boolean } | undefined>
>({});

/** Archives a workspace. Returns whether it did; if not, the reason is in `archiveProblems`. */
export async function archive(workspaceId: string, discard = false): Promise<boolean> {
	delete archiveProblems[workspaceId];
	try {
		await archiveWorkspace({ workspaceId, discard });
		return true;
	} catch (error) {
		archiveProblems[workspaceId] = {
			message: problemOf(error, 'Could not archive the workspace'),
			discardable: isHttpError(error) && error.status === 422
		};
		return false;
	}
}
