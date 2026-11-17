import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { workspaces } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

/**
 * An agent that works in another workspace's directory has no page of its own: it is a
 * conversation in that workspace, which is where a link to it leads. A workspace that is
 * not there (any more: the desktop app reopens the page it showed last) leads to a new one.
 */
export const load: PageServerLoad = ({ params }) => {
	const { worktreeId } = known(params.id) ?? redirect(307, resolve('/'));
	// one whose workspace is archived (or unknown) stands for itself
	if (worktreeId !== params.id && known(worktreeId)?.archivedAt === null)
		redirect(307, `${resolve('/workspaces/[id]', { id: worktreeId })}?agent=${params.id}`);
};

function known(id: string) {
	try {
		return workspaces().summary(id);
	} catch {
		return undefined;
	}
}
