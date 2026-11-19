import { error } from '@sveltejs/kit';
import { isSection } from '#lib/components/settings.svelte.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const section = params.section ?? 'general';
	if (!isSection(section)) error(404, 'There is no such section of the settings');
	return { section };
};
