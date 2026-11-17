import { error, json } from '@sveltejs/kit';
import { MAX_IMAGE_BYTES } from '@geordi/protocol';
import { images } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	if (request.headers.get('origin') !== url.origin) error(403, 'Invalid origin');
	// Bound the read even when the client omits Content-Length.
	const reader = request.body?.getReader();
	if (!reader) error(400, 'Choose an image');
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > MAX_IMAGE_BYTES) error(413, 'Images must be at most 5 MB');
			chunks.push(value);
		}
	} finally {
		await reader.cancel();
	}
	return json({ id: images().add(Buffer.concat(chunks)) });
};
