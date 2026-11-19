import { repos } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const { id, name } = repos().get(params.id);
	return { id, name };
};
