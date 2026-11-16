import { error } from '@sveltejs/kit';
import { repoIcon } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

/** The picture a repository has of itself (a favicon, a logo), for showing beside its name. */
export const GET: RequestHandler = async ({ params }) => {
	const icon = await repoIcon(params.id);
	if (!icon) error(404, 'This repository has no icon');
	return new Response(Buffer.from(icon.data, 'base64'), {
		headers: {
			'Content-Type': icon.type,
			'Cache-Control': 'private, max-age=300',
			// a file from a repository: shown as a picture, and as nothing else
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
		}
	});
};
