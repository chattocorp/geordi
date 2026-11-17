import { images } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const image = images().get(params.id);
	return new Response(Buffer.from(image.data, 'base64'), {
		headers: {
			'Content-Type': image.mediaType,
			'Cache-Control': 'private, max-age=31536000, immutable',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
