import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
	PROTOCOL_VERSION,
	type DaemonMessage,
	type DaemonRequest,
	type DaemonResults,
	type ForgeMessage
} from '@geordi/protocol';
import { WebSocketServer, type WebSocket } from 'ws';
import { createNonce, prove, verify } from '@geordi/protocol/auth';

type Handlers = {
	onHello(daemonId: string, running: string[]): void;
	onMessage(message: DaemonMessage): void;
};

const globals = globalThis as { __geordiDaemonServer?: WebSocketServer };

/** How long a new connection may take to authenticate. */
const HELLO_TIMEOUT_MS = 5000;
/** How long a daemon may take to answer a request. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Accepts daemon connections (ADR-002). Listens on 127.0.0.1 only. Forge and daemon
 * authenticate each other by challenge-response on a shared token (see protocol `auth.ts`);
 * browsers are refused outright, so web pages can't pose as daemons (cross-site WebSocket
 * hijacking).
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
	/** Requests awaiting a daemon's answer, by request ID. */
	const pending = new Map<string, (response: { result?: unknown; error?: string }) => void>();

	/** Sends to a connected daemon (the first one, for now). Returns false if there is none. */
	function send(message: ForgeMessage): boolean {
		const entry = [...daemons].find(([socket]) => socket.readyState === socket.OPEN);
		if (!entry) return false;
		const [socket, daemonId] = entry;
		if (message.type === 'turn.start') assigned.set(message.sessionId, daemonId);
		socket.send(JSON.stringify(message));
		return true;
	}

	server.on('connection', (socket) => {
		const timeout = setTimeout(
			() => socket.close(1008, 'Authentication timeout'),
			HELLO_TIMEOUT_MS
		);
		const nonce = createNonce();
		const challenge: ForgeMessage = { type: 'challenge', nonce };
		socket.send(JSON.stringify(challenge));

		socket.on('message', (data) => {
			let message: DaemonMessage;
			try {
				message = JSON.parse(String(data));
			} catch {
				return socket.close(1003, 'Invalid JSON');
			}

			const daemonId = daemons.get(socket);

			if (!daemonId) {
				if (message.type !== 'hello' || !verify(token, 'daemon', nonce, message.proof))
					return socket.close(1008, 'Unauthorized');
				if (message.protocol !== PROTOCOL_VERSION)
					return socket.close(1002, `Protocol ${message.protocol} not supported`);

				clearTimeout(timeout);
				const welcome: ForgeMessage = {
					type: 'welcome',
					proof: prove(token, 'forge', message.nonce)
				};
				socket.send(JSON.stringify(welcome));

				daemons.set(socket, message.daemonId);
				// After a forge restart we don't know assignments; trust what the daemon is running.
				for (const id of message.running) if (!assigned.has(id)) assigned.set(id, message.daemonId);
				console.log(`[daemons] ${message.daemonId} connected`);
				handlers.onHello(message.daemonId, message.running);
				return;
			}

			if (message.type === 'response') pending.get(message.id)?.(message);
			else if (message.type !== 'session.event' || assigned.get(message.sessionId) === daemonId)
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
		send,

		/** Asks a daemon a question about a workspace. Rejects if none answers in time. */
		request<K extends DaemonRequest['kind']>(
			request: Extract<DaemonRequest, { kind: K }>
		): Promise<DaemonResults[K]> {
			const id = randomUUID();
			return new Promise<DaemonResults[K]>((resolve, reject) => {
				const timeout = setTimeout(
					() => settle({ error: 'The daemon did not answer' }),
					REQUEST_TIMEOUT_MS
				);
				const settle = ({ result, error }: { result?: unknown; error?: string }) => {
					clearTimeout(timeout);
					pending.delete(id);
					if (error === undefined) resolve(result as DaemonResults[K]);
					else reject(new Error(error));
				};
				pending.set(id, settle);
				if (!send({ type: 'request', id, request })) settle({ error: 'No daemon connected' });
			});
		},

		connected: () => [...daemons.values()]
	};
}
