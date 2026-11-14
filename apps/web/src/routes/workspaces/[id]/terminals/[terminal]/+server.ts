import { terminals } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

/**
 * One terminal's output as server-sent events: recent output first (as a `replay` event),
 * then everything as it happens. Each event's data is a JSON string. Watching never starts
 * a shell; starting, input and resizing go through remote functions.
 */
export const GET: RequestHandler = ({ params }) => {
	const encoder = new TextEncoder();
	let detach = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			detach = terminals().attach(
				{ workspaceId: params.id, terminal: params.terminal },
				(data, replay) =>
					controller.enqueue(
						encoder.encode(`${replay ? 'event: replay\n' : ''}data: ${JSON.stringify(data)}\n\n`)
					)
			);
		},
		cancel: () => detach()
	});

	return new Response(stream, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }
	});
};
