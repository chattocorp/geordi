import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { workspaces } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

/** The Desk (FDR-012): its conversation, where it has one; otherwise the way to begin one. */
export const load: PageServerLoad = () => {
	const id = workspaces().desk();
	if (id) redirect(307, resolve('/workspaces/[id]', { id }));
};
