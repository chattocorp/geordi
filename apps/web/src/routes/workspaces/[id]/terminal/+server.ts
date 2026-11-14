import { terminals, workspaces } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

const dimension = (value: string | null, fallback: number) =>
	Math.min(500, Math.max(2, Math.trunc(Number(value)) || fallback));

/**
 * The workspace terminal's output as server-sent events: recent output first (as a `replay`
 * event), then everything as it happens. Each event's data is a JSON string. Input goes
 * through the `terminalInput` remote function.
 */
export const GET: RequestHandler = ({ params, url }) => {
	const { id } = params;
	workspaces().ref(id); // 404s for unknown workspaces

	const size = {
		cols: dimension(url.searchParams.get('cols'), 80),
		rows: dimension(url.searchParams.get('rows'), 24)
	};
	const encoder = new TextEncoder();
	let detach = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			detach = terminals().attach(id, size, (data, replay) =>
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
