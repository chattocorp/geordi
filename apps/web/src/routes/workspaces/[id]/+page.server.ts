import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { workspaces } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

/**
 * An agent that works in another workspace's directory has no page of its own: it is a
 * conversation in that workspace, which is where a link to it leads.
 */
export const load: PageServerLoad = ({ params }) => {
	let owner: string | null = null;
	try {
		const { worktreeId } = workspaces().summary(params.id);
		// one whose workspace is archived stands for itself
		if (worktreeId !== params.id && !workspaces().summary(worktreeId).archivedAt)
			owner = worktreeId;
	} catch {
		// unknown: the page says so
	}
	if (owner) redirect(307, `${resolve('/workspaces/[id]', { id: owner })}?agent=${params.id}`);
};
