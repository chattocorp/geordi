import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
	PROTOCOL_VERSION,
	type DaemonMessage,
	type AgentCommand,
	type BackgroundTask,
	type DaemonRequest,
	type DaemonResults,
	type ForgeMessage,
	type Harness
} from '@geordi/protocol';
import { WebSocketServer, type WebSocket } from 'ws';
import { createNonce, prove, verify } from '@geordi/protocol/auth';

type Handlers = {
	/** A daemon (re)connected, running these workspaces' turns and these terminals. */
	onHello(
		daemonId: string,
		running: string[],
		terminals: string[],
		ended: Record<string, number>
	): void;
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
	const background = new Map<string, { socket: WebSocket; tasks: BackgroundTask[] }>();
	const taskListeners = new Set<(workspaceId: string) => void>();
	function setTasks(socket: WebSocket, id: string, tasks: BackgroundTask[]) {
		if (tasks.length) background.set(id, { socket, tasks });
		else background.delete(id);
		for (const listener of taskListeners) listener(id);
	}
	/**
	 * Each workspace's agent's commands, as its daemon last said (ADR-003: live data, never
	 * stored). They stay when the daemon goes away, or the agent's CLI rests: they are still
	 * what it offers when it is next started. A reconnecting daemon says them again.
	 */
	const commands = new Map<string, AgentCommand[]>();
	const commandListeners = new Set<(workspaceId: string) => void>();
	/**
	 * What each workspace's agent suggests saying next. It outlives its daemon's connection
	 * (the agent said it, whoever relays it); a reconnecting daemon says it again anyway.
	 */
	const suggestions = new Map<string, string>();
	function setSuggestion(id: string, text: string | null) {
		if ((suggestions.get(id) ?? null) === text) return;
		if (text) suggestions.set(id, text);
		else suggestions.delete(id);
		for (const listener of taskListeners) listener(id);
	}
	/** What each connected daemon's agent CLIs offer, as it said when it connected. */
	const offers = new Map<WebSocket, Harness[]>();
	/** Told when a daemon connects or goes away. */
	const watching = new Set<() => void>();
	const changed = () => watching.forEach((tell) => tell());
	/** Which daemon each workspace's agent was last sent a message through; only it may report on the workspace. */
	const assigned = new Map<string, string>();
	/** Requests awaiting a daemon's answer, by request ID. */
	const pending = new Map<string, (response: { result?: unknown; error?: string }) => void>();

	/** Sends to a connected daemon (the first one, for now). Returns false if there is none. */
	function send(message: ForgeMessage): boolean {
		const entry = [...daemons].find(([socket]) => socket.readyState === socket.OPEN);
		if (!entry) return false;
		const [socket, daemonId] = entry;
		if (message.type === 'agent.message') assigned.set(message.workspaceId, daemonId);
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
				offers.set(socket, message.harnesses);
				changed();
				// After a forge restart we don't know assignments; trust what the daemon is running.
				for (const id of [...message.running, ...(message.sessions ?? [])])
					if (!assigned.has(id)) assigned.set(id, message.daemonId);
				console.log(`[daemons] ${message.daemonId} connected`);
				handlers.onHello(message.daemonId, message.running, message.terminals, message.ended ?? {});
				return;
			}

			if (message.type === 'workspace.background') {
				if (assigned.get(message.workspaceId) === daemonId)
					setTasks(socket, message.workspaceId, message.tasks);
				return;
			}
			if (message.type === 'workspace.usage') {
				if (assigned.get(message.workspaceId) === daemonId) handlers.onMessage(message);
				return;
			}
			if (message.type === 'workspace.commands') {
				if (assigned.get(message.workspaceId) !== daemonId) return;
				commands.set(message.workspaceId, message.commands);
				for (const listener of commandListeners) listener(message.workspaceId);
				return;
			}
			if (message.type === 'workspace.suggestion') {
				if (assigned.get(message.workspaceId) === daemonId)
					setSuggestion(message.workspaceId, message.text);
				return;
			}
			if (message.type === 'response') pending.get(message.id)?.(message);
			else if (
				message.type !== 'workspace.event' ||
				assigned.get(message.workspaceId) === daemonId
			) {
				// what was suggested was for the turn that ended, not for the next
				if (message.type === 'workspace.event' && message.event.kind === 'turn.started')
					setSuggestion(message.workspaceId, null);
				handlers.onMessage(message);
				if (message.type === 'workspace.event' && message.cursor) {
					const ack: ForgeMessage = {
						type: 'workspace.ack',
						workspaceId: message.workspaceId,
						cursor: message.cursor
					};
					socket.send(JSON.stringify(ack));
				}
			}
			// never silently: an agent working where nobody sees it is the worst that can happen
			else
				console.warn(
					`[daemons] dropped ${message.event.kind} from ${daemonId} for workspace ${message.workspaceId}, which it was not given`
				);
		});

		socket.on('close', () => {
			clearTimeout(timeout);
			const daemonId = daemons.get(socket);
			if (daemonId) console.log(`[daemons] ${daemonId} disconnected`);
			for (const [id, entry] of background) if (entry.socket === socket) setTasks(socket, id, []);
			daemons.delete(socket);
			offers.delete(socket);
			changed();
		});
	});

	return {
		send,
		background: (id: string) => background.get(id)?.tasks ?? [],
		suggestion: (id: string) => suggestions.get(id) ?? null,
		/** Calls `listener` when a workspace's background tasks or suggestion change. */
		followBackground(listener: (workspaceId: string) => void) {
			taskListeners.add(listener);
			return () => taskListeners.delete(listener);
		},

		/** The commands the workspace's agent offers; `null` until it has said. */
		commands: (id: string) => commands.get(id) ?? null,
		followCommands(listener: (workspaceId: string) => void) {
			commandListeners.add(listener);
			return () => commandListeners.delete(listener);
		},

		/** Asks a daemon a question about a workspace. Rejects if none answers in time. */
		request<K extends DaemonRequest['kind']>(
			request: Extract<DaemonRequest, { kind: K }>,
			timeoutMs = REQUEST_TIMEOUT_MS
		): Promise<DaemonResults[K]> {
			const id = randomUUID();
			return new Promise<DaemonResults[K]>((resolve, reject) => {
				const timeout = setTimeout(() => settle({ error: 'The daemon did not answer' }), timeoutMs);
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

		/**
		 * The models and effort levels on offer: those of the daemon that turns are sent to.
		 * `null` while no daemon is connected.
		 */
		harnesses: (): Harness[] | null =>
			[...offers].find(([socket]) => socket.readyState === socket.OPEN)?.[1] ?? null,

		/** Calls `tell` whenever a daemon connects or goes away. Returns a function that ends it. */
		subscribe(tell: () => void): () => void {
			watching.add(tell);
			return () => watching.delete(tell);
		},

		connected: () => [...daemons.values()]
	};
}
