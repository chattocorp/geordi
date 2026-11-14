import type { IncomingMessage } from 'node:http';
import { PROTOCOL_VERSION, type DaemonMessage, type ForgeMessage } from '@geordi/protocol';
import { WebSocketServer, type WebSocket } from 'ws';
import { tokensMatch } from './daemon-token.ts';

type Handlers = {
	onHello(daemonId: string, running: string[]): void;
	onMessage(message: DaemonMessage): void;
};

const globals = globalThis as { __geordiDaemonServer?: WebSocketServer };

/** How long a new connection may take to authenticate. */
const HELLO_TIMEOUT_MS = 5000;

/**
 * Accepts daemon connections (ADR-002). Listens on 127.0.0.1 only. Daemons authenticate
 * with a shared token in their `hello`; browsers are refused outright, so web pages can't
 * pose as daemons (cross-site WebSocket hijacking).
 */
export function createHub(port: number, token: string, handlers: Handlers) {
	// Dev-mode module reloads re-create the hub; release the port first. Daemons reconnect.
	const previous = globals.__geordiDaemonServer;
	if (previous) {
		for (const client of previous.clients) client.terminate();
		previous.close();
	}

	const server = new WebSocketServer({
		host: '127.0.0.1',
		port,
		// Browsers always send Origin on WebSocket upgrades; daemons never do.
		verifyClient: ({ req }: { req: IncomingMessage }) => req.headers.origin === undefined
	});
	globals.__geordiDaemonServer = server;
	server.on('error', (error) => console.error('[daemons]', error.message));

	/** Authenticated daemons, by socket. */
	const daemons = new Map<WebSocket, string>();
	/** Which daemon each session's turns were sent to; only it may report on the session. */
	const assigned = new Map<string, string>();

	server.on('connection', (socket) => {
		const timeout = setTimeout(
			() => socket.close(1008, 'Authentication timeout'),
			HELLO_TIMEOUT_MS
		);

		socket.on('message', (data) => {
			let message: DaemonMessage;
			try {
				message = JSON.parse(String(data));
			} catch {
				return socket.close(1003, 'Invalid JSON');
			}

			const daemonId = daemons.get(socket);

			if (!daemonId) {
				if (message.type !== 'hello' || !tokensMatch(token, message.token))
					return socket.close(1008, 'Unauthorized');
				if (message.protocol !== PROTOCOL_VERSION)
					return socket.close(1002, `Protocol ${message.protocol} not supported`);

				clearTimeout(timeout);
				daemons.set(socket, message.daemonId);
				// After a forge restart we don't know assignments; trust what the daemon is running.
				for (const id of message.running) if (!assigned.has(id)) assigned.set(id, message.daemonId);
				console.log(`[daemons] ${message.daemonId} connected`);
				handlers.onHello(message.daemonId, message.running);
				return;
			}

			if (message.type === 'session.event' && assigned.get(message.sessionId) === daemonId)
				handlers.onMessage(message);
		});

		socket.on('close', () => {
			clearTimeout(timeout);
			const daemonId = daemons.get(socket);
			if (daemonId) console.log(`[daemons] ${daemonId} disconnected`);
			daemons.delete(socket);
		});
	});

	return {
		/** Sends to a connected daemon (the first one, for now). Returns false if there is none. */
		send(message: ForgeMessage): boolean {
			const entry = [...daemons].find(([socket]) => socket.readyState === socket.OPEN);
			if (!entry) return false;
			const [socket, daemonId] = entry;
			if (message.type === 'turn.start') assigned.set(message.sessionId, daemonId);
			socket.send(JSON.stringify(message));
			return true;
		},

		connected: () => [...daemons.values()]
	};
}
