import { error } from '@sveltejs/kit';
import { hub, workspaces } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

/**
 * A picture the workspace's agent referred to in what it wrote (`?path=`, as it wrote it),
 * read by the daemon where the agent works. Live data (ADR-003): asked for, never stored.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const path = url.searchParams.get('path');
	if (!path) error(400, 'Which picture?');
	const ref = workspaces().ref(params.id);
	const picture = await hub()
		.request({ kind: 'picture', path, ...ref })
		.catch(() => null); // no daemon, or no worktree: no picture
	if (!picture) error(404, 'There is no such picture');
	return new Response(Buffer.from(picture.data, 'base64'), {
		headers: {
			'Content-Type': picture.mediaType,
			// saved, it keeps its own name
			'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.split('/').pop()!)}`,
			// the agent may well write the file again
			'Cache-Control': 'private, max-age=60',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
