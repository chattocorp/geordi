import { error } from '@sveltejs/kit';
import { terminals } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

/** How many terminals one stream follows at most. */
const MOST = 30;

/**
 * The output of a workspace's terminals (`?names=a,b`) as server-sent events, all in one
 * stream: a browser has six connections to a server, and a stream per terminal would soon
 * leave none for anything else. For each terminal, its recent output comes first (as a
 * `replay` event), then everything as it happens. Each event's data is JSON: the terminal's
 * name and what it put out. Watching never starts a shell; starting, input and resizing go
 * through remote functions.
 */
export const GET: RequestHandler = ({ params, url }) => {
	const names = [...new Set((url.searchParams.get('names') ?? '').split(',').filter(Boolean))];
	// the same names the remote functions accept
	if (names.length > MOST || names.some((name) => !/^[\w-]{1,40}$/.test(name)))
		error(404, 'No such terminal');
	const encoder = new TextEncoder();
	let detach: (() => void)[] = [];

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			detach = names.map((terminal) =>
				terminals().attach({ workspaceId: params.id, terminal }, (data, replay) =>
					controller.enqueue(
						encoder.encode(
							`${replay ? 'event: replay\n' : ''}data: ${JSON.stringify({ terminal, data })}\n\n`
						)
					)
				)
			);
		},
		cancel: () => detach.forEach((stop) => stop())
	});

	return new Response(stream, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }
	});
};
