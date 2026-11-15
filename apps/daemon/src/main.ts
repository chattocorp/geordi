import { readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import {
	PROTOCOL_VERSION,
	type DaemonMessage,
	type DaemonRequest,
	type ForgeMessage,
	type AgentEvent
} from '@geordi/protocol';
import { createNonce, prove, verify } from '@geordi/protocol/auth';
import { adapterFor } from './agents/adapter.ts';
import { status, versions } from './changes.ts';
import {
	closeTerminal,
	closeTerminals,
	openTerminal,
	resizeTerminal,
	runningTerminals,
	scrollbackOf,
	writeTerminal
} from './terminals.ts';
import { removeWorktree } from './remove.ts';
import { titleFor } from './titles.ts';
import { resumeTurns, runTurn, type Turn } from './turn.ts';
import { upstream } from './upstream.ts';
import { createWatches } from './watch.ts';
import { ensureWorktree, locateWorktree, verifyLinks } from './worktree.ts';

const forgeUrl = new URL(process.env.GEORDI_FORGE_URL || 'ws://127.0.0.1:7700');
/** Where agents on this machine reach the forge's agent API (ADR-004). */
const apiUrl = new URL('/mcp', process.env.GEORDI_FORGE_HTTP_URL || 'http://127.0.0.1:3000').href;
const worktreesDir = process.env.GEORDI_WORKTREES_DIR || join(homedir(), '.geordi', 'worktrees');
/** Where running agent turns keep their output, so that they outlive this process (ADR-007). */
const turnsDir = process.env.GEORDI_TURNS_DIR || join(homedir(), '.geordi', 'turns');
const tokenFile =
	process.env.GEORDI_DAEMON_TOKEN_FILE || join(homedir(), '.geordi', 'daemon-token');
const daemonId = hostname();

// Unencrypted connections are only acceptable on this machine. Both carry secrets: the
// daemon's token, and the agents' API tokens.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
for (const [url, secure] of [
	[forgeUrl, 'wss:'],
	[new URL(apiUrl), 'https:']
] as const)
	if (url.protocol !== secure && !LOOPBACK.has(url.hostname)) {
		console.error(`Refusing unencrypted connection to ${url.host}; use ${secure}//`);
		process.exit(1);
	}

/** The forge's shared secret. Read on every connect: the forge creates it on first start. */
function readToken(): string | null {
	if (process.env.GEORDI_DAEMON_TOKEN) return process.env.GEORDI_DAEMON_TOKEN;
	try {
		return readFileSync(tokenFile, 'utf8').trim();
	} catch {
		return null;
	}
}

/** File watchers for the workspaces someone is looking at; see the `watch` message. */
const watches = createWatches(
	({ repoPath, worktreeId }) => locateWorktree(worktreesDir, repoPath, worktreeId),
	(worktreeId) => sendLive({ type: 'worktree.changed', worktreeId })
);

// --- Connection to the forge --------------------------------------------------------------

/** The current connection, set only once the forge has proven it knows the token. */
let socket: WebSocket | null = null;
/** Messages produced while disconnected; sent once the next connection is authenticated. */
const outbox: DaemonMessage[] = [];

function send(message: DaemonMessage) {
	if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
	else outbox.push(message);
}

/** Reports what a workspace's agent does. Queued while there is no forge to tell. */
const emitFor = (workspaceId: string) => (event: AgentEvent) =>
	send({ type: 'workspace.event', workspaceId, event });

/** The turns running right now, by workspace: ones we started, and ones we found running. */
const turns = await resumeTurns(turnsDir, adapterFor, emitFor);
for (const [workspaceId, turn] of turns) forget(workspaceId, turn);

function forget(workspaceId: string, turn: Turn) {
	turn.done.then(() => {
		if (turns.get(workspaceId) === turn) turns.delete(workspaceId);
	});
}

/**
 * The workspaces whose turn the forge has not heard the end of: those still running, and
 * those that ended while it was away, whose last events are waiting in the outbox. Leaving
 * the latter out would have the forge give them up as lost, a moment before their ending
 * arrives.
 */
const unreported = () => [
	...new Set([
		...turns.keys(),
		...outbox.flatMap((m) => (m.type === 'workspace.event' ? [m.workspaceId] : []))
	])
];

/**
 * For messages that only matter to a forge that is listening right now: terminal output
 * (kept in the terminal's scrollback), exits (reported with the next `hello`) and file
 * changes (the forge asks afresh when it is back).
 */
function sendLive(message: DaemonMessage) {
	if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function connect(delay = 500) {
	const retry = () => setTimeout(() => connect(Math.min(delay * 2, 5000)), delay);

	const token = readToken();
	if (!token) {
		console.log(`waiting for the forge's token in ${tokenFile}`);
		return retry();
	}

	const ws = new WebSocket(forgeUrl);
	const nonce = createNonce();

	ws.onmessage = (event) => {
		let message: ForgeMessage;
		try {
			message = JSON.parse(String(event.data));
		} catch {
			return ws.close(4000, 'Invalid JSON');
		}

		if (socket === ws) return handle(message);

		// Handshake (see @geordi/protocol/auth): answer the challenge, then verify the forge.
		if (message.type === 'challenge') {
			const hello: DaemonMessage = {
				type: 'hello',
				protocol: PROTOCOL_VERSION,
				daemonId,
				nonce,
				proof: prove(token, 'daemon', message.nonce),
				running: unreported(),
				terminals: runningTerminals()
			};
			ws.send(JSON.stringify(hello));
		} else if (message.type === 'welcome' && verify(token, 'forge', nonce, message.proof)) {
			console.log(`connected to ${forgeUrl}`);
			socket = ws;
			delay = 500;
			for (const queued of outbox.splice(0)) ws.send(JSON.stringify(queued));
		} else {
			console.error('the forge failed to authenticate; disconnecting');
			ws.close(4001, 'Unauthorized');
		}
	};

	ws.onclose = (event) => {
		if (socket === ws) console.log('disconnected; reconnecting');
		else if (event.reason) console.log(`connection refused: ${event.reason}`);
		// Turns and terminals keep running: the forge picks them up again when it is back.
		if (socket === ws) socket = null;
		retry();
	};
}

// --- Handling forge commands ----------------------------------------------------------------

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function answer(request: DaemonRequest) {
	if (request.kind === 'scrollback') return scrollbackOf(request.terminalId);
	if (request.kind === 'title') return titleFor(request.text);
	if (request.kind === 'removeWorktree') {
		removeWorktree(worktreesDir, request.repoPath, request.worktreeId, request.force);
		return null;
	}

	const worktree = locateWorktree(worktreesDir, request.repoPath, request.worktreeId);
	switch (request.kind) {
		case 'changes':
			return status(worktree, request);
		case 'diff':
			return versions(worktree, request, request.path);
		case 'upstream':
			return upstream(worktree, request);
	}
}

async function handle(message: ForgeMessage) {
	switch (message.type) {
		case 'turn.start': {
			const { workspaceId, worktreeId, agent, repoPath, base, resumeId, prompt } = message;
			const emit = emitFor(workspaceId);

			// The forge sends the next message as soon as the agent says it is done, which is a
			// moment before its process has exited. Let it finish; if it won't, end it.
			const previous = turns.get(workspaceId);
			if (previous) {
				await Promise.race([previous.done, new Promise((resolve) => setTimeout(resolve, 10_000))]);
				if (turns.get(workspaceId) === previous) {
					previous.stop();
					await previous.done;
				}
			}

			try {
				const worktree = ensureWorktree(worktreesDir, repoPath, worktreeId, base);
				if (worktree.created) {
					emit({ kind: 'worktree', path: worktree.path, branch: worktree.branch });
					watches.refresh();
				}

				const adapter = await adapterFor(agent);
				const turn = runTurn(
					adapter,
					agent,
					{
						sessionId: workspaceId,
						prompt,
						resumeId,
						cwd: worktree.path,
						writableRoots: worktree.writableRoots,
						api: { url: apiUrl }
					},
					emit,
					join(turnsDir, workspaceId),
					message.apiToken
				);
				turns.set(workspaceId, turn);
				forget(workspaceId, turn);
			} catch (error) {
				emit({ kind: 'turn.failed', error: errorMessage(error) });
			}
			break;
		}

		case 'request':
			try {
				send({ type: 'response', id: message.id, result: await answer(message.request) });
			} catch (error) {
				send({ type: 'response', id: message.id, error: errorMessage(error) });
			}
			break;

		case 'watch':
			watches.set(message.worktrees);
			break;

		case 'terminal.open': {
			const { terminalId } = message;
			const output = (data: string, offset = 0) =>
				sendLive({ type: 'terminal.output', terminalId, data, offset });
			const exit = () => sendLive({ type: 'terminal.exit', terminalId });
			try {
				const worktree = locateWorktree(worktreesDir, message.repoPath, message.worktreeId);
				const guard = () => verifyLinks(worktree);
				openTerminal(terminalId, worktree.path, message, guard, output, exit);
			} catch (error) {
				output(`${errorMessage(error)}\r\n`);
				exit();
			}
			break;
		}

		case 'terminal.input':
			writeTerminal(message.terminalId, message.data);
			break;

		case 'terminal.resize':
			resizeTerminal(message.terminalId, message);
			break;

		case 'terminal.close':
			closeTerminal(message.terminalId);
			break;

		case 'turn.stop':
			turns.get(message.workspaceId)?.stop();
			break;

		default:
			break; // handshake messages are handled in connect()
	}
}

// Ctrl+C is someone stopping Geordi: the agents stop with it. Any other way of going away
// (a restart, a crash, being replaced) leaves them working for the next daemon to pick up.
process.on('SIGINT', () => {
	for (const turn of turns.values()) turn.stop();
	closeTerminals();
	process.exit(0);
});

console.log(`geordi daemon ${daemonId}, worktrees in ${worktreesDir}`);
connect();
