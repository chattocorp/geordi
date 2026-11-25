import type { WorkspaceAction } from '@geordi/ui/actions';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
	PROTOCOL_VERSION,
	type DaemonMessage,
	type AgentCommand,
	type SessionModel,
	type BackgroundTask,
	type ContextUsage,
	type UsageLimit,
	type DaemonRequest,
	type DaemonResults,
	type ForgeMessage,
	type Harness
} from '@geordi/protocol';
import type { EventStore, GeordiEvent } from './events/index.ts';
import { onListenError } from './listening.ts';
import { WebSocketServer, WebSocket } from 'ws';
import { createNonce, prove, verify } from '@geordi/protocol/auth';

/** Only operations that change the worktree or its pull request belong in the sidebar. */
function actionForRequest(request: DaemonRequest): WorkspaceAction['id'] | undefined {
	switch (request.kind) {
		case 'mergePull':
			return 'merge-pull';
		case 'setAutoMerge':
			return request.enabled ? 'enable-auto-merge' : 'cancel-auto-merge';
		case 'markReady':
			return 'ready-for-review';
		case 'updateWorktree':
			return 'merge-upstream';
		case 'continueWorktree':
			return 'continue';
		case 'prepareWorktree':
			return 'restore-worktree';
		case 'removeWorktree':
			return 'archive';
	}
}

export type DaemonEvent = { type: 'daemon.selected'; stream: 'daemon'; data: { id: string } };

/** A different session directory can take over once the previous owner's turns have ended. */
export function daemonAdmission(store: EventStore<GeordiEvent>, hasRunningTurn: () => boolean) {
	const owner = store.project(
		'selected-daemon',
		(): string | null => null,
		(id, event) => (event.type === 'daemon.selected' ? event.data.id : id),
		['daemon']
	);
	return (id: string) => {
		if (owner.get() === id) return true;
		if (owner.get() && hasRunningTurn()) return false;
		store.append({ type: 'daemon.selected', stream: 'daemon', data: { id } });
		return true;
	};
}

type ActiveDaemon = { socket: WebSocket; id: string; harnesses: Harness[]; assigned: Set<string> };

type Handlers = {
	admit(id: string): boolean;
	/** A daemon (re)connected, running these workspaces' turns and these terminals. */
	onHello(
		daemonId: string,
		running: string[],
		terminals: string[],
		ended: Record<string, number>
	): void;
	onMessage(message: DaemonMessage): void;
	/** How full a workspace's agent's context is, as it just said. */
	onUsage(workspaceId: string, usage: ContextUsage): void;
	/** The usage limits of a workspace's agent's subscription, and when it said them. */
	onLimits(workspaceId: string, limits: UsageLimit[], at?: number): void;
	/** What the workspace's agent suggests saying next; `null` once withdrawn. */
	onSuggestion(workspaceId: string, text: string | null): void;
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
	server.on('error', onListenError('daemons', port, previous !== undefined));

	let active: ActiveDaemon | null = null;
	const background = new Map<string, BackgroundTask[]>();
	const sessionListeners = new Set<(workspaceId: string) => void>();
	function setTasks(id: string, tasks: BackgroundTask[]) {
		if (tasks.length) background.set(id, tasks);
		else background.delete(id);
		for (const listener of sessionListeners) listener(id);
	}
	/**
	 * Each workspace's agent's commands, as its daemon last said (ADR-003: live data, never
	 * stored). They stay when the daemon goes away, or the agent's CLI rests: they are still
	 * what it offers when it is next started. A reconnecting daemon says them again.
	 */
	const commands = new Map<string, AgentCommand[]>();
	const commandListeners = new Set<(workspaceId: string) => void>();
	const sessionModels = new Map<string, SessionModel>();
	/** Told when a daemon connects or goes away. */
	const watching = new Set<() => void>();
	const changed = () => watching.forEach((tell) => tell());
	/** Requests awaiting a daemon's answer, by request ID. */
	const pending = new Map<string, (response: { result?: unknown; error?: string }) => void>();

	// Request IDs keep overlapping operations independent, including on timeout or disconnect.
	const operations = new Map<string, { worktreeId: string; action: WorkspaceAction['id'] }>();
	const operationListeners = new Set<() => void>();
	const operationsChanged = () => operationListeners.forEach((tell) => tell());

	/** Sends to the active daemon. Returns false if there is none. */
	function send(message: ForgeMessage): boolean {
		if (!active || active.socket.readyState !== WebSocket.OPEN) return false;
		if (message.type === 'agent.message') active.assigned.add(message.workspaceId);
		active.socket.send(JSON.stringify(message));
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

			try {
				receive(message);
			} catch (error) {
				console.error('[daemons] could not process message', error);
				socket.close(1011, 'Could not process daemon message');
			}
		});
		socket.on('error', () => socket.terminate());

		function receive(message: DaemonMessage) {
			if (socket.readyState !== WebSocket.OPEN) return;
			if (active?.socket !== socket) {
				if (message.type !== 'hello' || !verify(token, 'daemon', nonce, message.proof))
					return socket.close(1008, 'Unauthorized');
				if (message.protocol !== PROTOCOL_VERSION)
					return socket.close(1002, `Protocol ${message.protocol} not supported`);

				if (active) return socket.close(1008, 'Another daemon is already connected');
				if (!handlers.admit(message.daemonId))
					return socket.close(1008, 'Waiting for the daemon that owns the running turns');
				clearTimeout(timeout);
				const welcome: ForgeMessage = {
					type: 'welcome',
					proof: prove(token, 'forge', message.nonce)
				};
				socket.send(JSON.stringify(welcome));

				active = {
					socket,
					id: message.daemonId,
					harnesses: message.harnesses,
					assigned: new Set([...message.running, ...(message.sessions ?? [])])
				};
				let alive = true;
				socket.on('pong', () => {
					alive = true;
				});
				const heartbeat = setInterval(() => {
					if (!alive) return socket.terminate();
					alive = false;
					socket.ping();
				}, 15_000).unref();
				socket.once('close', () => clearInterval(heartbeat));
				changed();
				console.log(`[daemons] ${message.daemonId} connected`);
				handlers.onHello(message.daemonId, message.running, message.terminals, message.ended ?? {});
				return;
			}

			const daemonId = active.id;
			if (message.type === 'workspace.live') {
				const { workspaceId: id, live } = message;
				if (!active.assigned.has(id)) return;
				if (live.background) setTasks(id, live.background);
				if (live.suggestion !== undefined) handlers.onSuggestion(id, live.suggestion);
				if (live.sessionModel) {
					sessionModels.set(id, live.sessionModel);
					for (const listener of sessionListeners) listener(id);
				}
				if (live.commands) {
					commands.set(id, live.commands);
					for (const listener of commandListeners) listener(id);
				}
				if (live.usage) handlers.onUsage(id, live.usage);
				if (live.limits) handlers.onLimits(id, live.limits, live.limitsAt);
				return;
			}
			if (message.type === 'response') pending.get(message.id)?.(message);
			else if (message.type !== 'workspace.event' || active.assigned.has(message.workspaceId)) {
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
		}

		socket.on('close', () => {
			clearTimeout(timeout);
			if (active?.socket !== socket) return;
			console.log(`[daemons] ${active.id} disconnected`);
			active = null;
			for (const id of background.keys()) setTasks(id, []);
			for (const settle of pending.values()) settle({ error: 'Daemon disconnected' });
			changed();
		});
	});

	return {
		port: () => (server.address() as { port: number } | null)?.port,
		close() {
			for (const client of server.clients) client.terminate();
			server.close();
		},
		send,
		stopTask(workspaceId: string, stopId: string) {
			if (!background.get(workspaceId)?.some((task) => task.stopId === stopId)) return false;
			return send({ type: 'agent.stopTask', workspaceId, stopId });
		},
		background: (id: string) => background.get(id) ?? [],
		sessionModel: (id: string) => sessionModels.get(id),
		/** Calls `listener` when session data in the workspace view changes. */
		followSession(listener: (workspaceId: string) => void) {
			sessionListeners.add(listener);
			return () => sessionListeners.delete(listener);
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
				const timeout = setTimeout(() => {
					if (request.kind === 'removeWorktree') send({ type: 'cancelRemoval', id });
					settle({ error: 'The daemon did not answer' });
				}, timeoutMs);
				const settle = ({ result, error }: { result?: unknown; error?: string }) => {
					clearTimeout(timeout);
					pending.delete(id);
					if (operations.delete(id)) operationsChanged();
					if (error === undefined) resolve(result as DaemonResults[K]);
					else reject(new Error(error));
				};
				pending.set(id, settle);
				if (!send({ type: 'request', id, request }))
					return settle({ error: 'No daemon connected' });
				const action = actionForRequest(request);
				if (action && 'worktreeId' in request && request.worktreeId) {
					operations.set(id, { worktreeId: request.worktreeId, action });
					operationsChanged();
				}
			});
		},

		/**
		 * The models and effort levels on offer: those of the daemon that turns are sent to.
		 * `null` while no daemon is connected.
		 */
		harnesses: () => (active?.socket.readyState === WebSocket.OPEN ? active.harnesses : null),

		operations: () => operations.values(),
		followOperations(tell: () => void) {
			operationListeners.add(tell);
			return () => operationListeners.delete(tell);
		},

		/** Calls `tell` whenever a daemon connects or goes away. Returns a function that ends it. */
		subscribe(tell: () => void): () => void {
			watching.add(tell);
			return () => watching.delete(tell);
		},

		connected: () => (active ? [active.id] : [])
	};
}
