import { repoIcon } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

/** Kept by the browser as long as the forge keeps what the daemon said. */
const CACHE = 'private, max-age=300';

/** The picture a repository has of itself (a favicon, a logo), for showing beside its name. */
export const GET: RequestHandler = async ({ params }) => {
	const icon = await repoIcon(params.id);
	// none is an answer too, and not an error: the browser keeps it and logs nothing
	if (!icon) return new Response(null, { status: 204, headers: { 'Cache-Control': CACHE } });
	return new Response(Buffer.from(icon.data, 'base64'), {
		headers: {
			'Content-Type': icon.type,
			'Cache-Control': CACHE,
			// a file from a repository: shown as a picture, and as nothing else
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
		}
	});
};
