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
	const where = workspaces().locate(params.id);
	const worktreeOnly = url.searchParams.has('file');
	if (worktreeOnly && 'project' in where) error(404);
	const picture = await hub()
		.request(
			'project' in where
				? { kind: 'projectPicture', path, ...where }
				: { kind: 'picture', path, worktreeOnly, ...where }
		)
		.catch(() => null); // no daemon, or no worktree: no picture
	if (!picture) error(404, 'There is no such picture');
	return new Response(Buffer.from(picture.data, 'base64'), {
		headers: {
			'Content-Type': picture.mediaType,
			// saved, it keeps its own name
			'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.split('/').pop()!)}`,
			// the agent may well write the file again
			'Cache-Control': 'private, max-age=60',
			'X-Content-Type-Options': 'nosniff',
			// opened on its own, an SVG is a page of the forge's: it may run nothing, load nothing
			'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
		}
	});
};
