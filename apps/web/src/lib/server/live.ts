import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { View } from './views.ts';

/**
 * What is live on a page reaches its browser here: over one WebSocket per window, which
 * carries everything the window follows (the sidebar's data, a workspace, its terminals).
 *
 * Not as requests: a browser has six connections to a server, shared by all its windows,
 * and whatever holds one for as long as it is on screen (a live query, an event stream)
 * soon leaves none for anything else, after which no click gets through. WebSockets are
 * not counted among them.
 *
 * The browser says what it follows, each under a number of its own choosing:
 *   `{ follow: 1, view: 'workspace', key: '<id>' }`       a view (see `views.ts`), by name
 *   `{ follow: 2, terminal: '<name>', of: '<workspace>' }` a terminal's output
 *   `{ drop: 1 }`                                          no longer
 * and is sent, under that number, a view's value whenever it is another (`{ id, value }`),
 * a terminal's output (`{ id, data, replay }`: `replay` for what it had put out before),
 * or why there is nothing to send (`{ id, error, status }`).
 */

type Following =
	| { follow: number; view: string; key?: string }
	| { follow: number; terminal: string; of: string }
	| { drop: number };

type Options = {
	port: number;
	host: string;
	/** The hostnames the forge answers to: a page from anywhere else is turned away. */
	allowed: Set<string>;
	/**
	 * What a page has to know to be let in: the forge puts it into its own pages, which no
	 * page of another origin can read. The same after a restart, so that pages open then
	 * find their way back.
	 */
	token: string;
	views: Record<string, (key: string) => View<unknown>>;
	/** A view's values: now, and again whenever it may have changed, until `signal` says stop. */
	values: <T>(view: View<T>, signal: AbortSignal) => AsyncGenerator<T>;
	/** Follows a terminal's output: its recent output first. Returns how to stop. */
	terminal: (
		at: { workspaceId: string; terminal: string },
		listener: (data: string, replay: boolean) => void
	) => () => void;
};

const globals = globalThis as { __geordiLiveServer?: WebSocketServer };

const hostOf = (value: string | undefined) => {
	try {
		return new URL(value?.includes('://') ? value : `http://${value}`).hostname;
	} catch {
		return null;
	}
};

/** What went wrong, as a sentence and (for what a page would have got as a status) a number. */
function problemOf(error: unknown): { error: string; status?: number } {
	const { status, body, message } = error as {
		status?: number;
		body?: { message?: string };
		message?: string;
	};
	return { error: body?.message ?? message ?? String(error), status };
}

export function createLive({ port, host, allowed, token, views, values, terminal }: Options) {
	// Dev-mode module reloads re-create this; release the port first. Browsers reconnect.
	const previous = globals.__geordiLiveServer;
	if (previous) {
		for (const client of previous.clients) client.terminate();
		previous.close();
	}

	const server = new WebSocketServer({
		host,
		port,
		// what browsers send here is a few words: nothing long is anything of ours
		maxPayload: 16 * 1024,
		// Only pages of our own. A page from anywhere may open a WebSocket to anywhere, and
		// would otherwise read along (cross-site WebSocket hijacking): also one served from
		// this machine on another port, as what an agent runs here is. So a page has to show
		// the token that only the forge's own pages carry. And only by a name we answer to,
		// as with every other request (DNS rebinding).
		verifyClient: ({ req }: { req: IncomingMessage }) => {
			// whatever is sent here, it is turned away at worst: never an error that goes
			// unanswered, which would take the forge down
			try {
				const [from, to] = [hostOf(req.headers.origin), hostOf(req.headers.host)];
				if (!from || !to || !allowed.has(from) || !allowed.has(to)) return false;
				const shown = Buffer.from(
					new URL(req.url ?? '/', 'http://x').searchParams.get('token') ?? ''
				);
				const known = Buffer.from(token);
				// (in bytes: characters of the same number may be bytes of another)
				return shown.length === known.length && timingSafeEqual(shown, known);
			} catch {
				return false;
			}
		}
	});
	globals.__geordiLiveServer = server;
	server.on('error', (error) => console.error('[live]', error.message));

	server.on('connection', (socket: WebSocket) => {
		/** How to stop each thing this window follows, by the number it gave it. */
		const following = new Map<number, () => void>();
		const sendText = (text: string) => socket.readyState === socket.OPEN && socket.send(text);
		const send = (message: object) => sendText(JSON.stringify(message));
		const drop = (id: number) => {
			following.get(id)?.();
			following.delete(id);
		};

		async function follow(id: number, view: View<unknown>, signal: AbortSignal) {
			let last: string | undefined;
			try {
				for await (const value of values(view, signal)) {
					// the same again is no news: most events are about something else. (Put into
					// words once: a workspace's conversation is long.)
					const next = JSON.stringify(value) ?? 'null';
					if (next !== last) sendText(`{"id":${id},"value":${next}}`);
					last = next;
				}
			} catch (error) {
				if (!signal.aborted) send({ id, ...problemOf(error) });
			}
		}

		socket.on('message', (raw) => {
			try {
				hear(JSON.parse(String(raw)));
			} catch {
				// not something of ours: nothing to do with it, and nothing to fall over
			}
		});

		function hear(message: Following) {
			// (anything can be sent: `null`, a number, a list)
			if (typeof message !== 'object' || message === null) return;
			if ('drop' in message) return drop(Number(message.drop));
			if (typeof message.follow !== 'number') return;
			const id = message.follow;
			drop(id);

			if ('terminal' in message) {
				// the same names the remote functions accept
				if (!/^[\w-]{1,40}$/.test(String(message.terminal)))
					return void send({ id, error: 'No such terminal', status: 404 });
				try {
					const at = { workspaceId: String(message.of), terminal: message.terminal };
					following.set(
						id,
						terminal(at, (data, replay) => send({ id, data, replay }))
					);
				} catch (error) {
					send({ id, ...problemOf(error) });
				}
				return;
			}

			const view = Object.hasOwn(views, message.view) ? views[message.view] : undefined;
			if (!view) return void send({ id, error: 'Nothing by that name', status: 404 });
			const stop = new AbortController();
			following.set(id, () => stop.abort());
			void follow(id, view(String(message.key ?? '')), stop.signal);
		}

		socket.on('close', () => {
			for (const id of [...following.keys()]) drop(id);
		});
		socket.on('error', () => socket.terminate());
	});

	return {
		/** The port it listens on, once it does. */
		port: () => (server.address() as { port: number } | null)?.port,
		close() {
			for (const client of server.clients) client.terminate();
			server.close();
		}
	};
}
