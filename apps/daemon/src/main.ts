import { readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import {
	PROTOCOL_VERSION,
	type DaemonMessage,
	type DaemonRequest,
	type ForgeMessage,
	type SessionEvent
} from '@geordi/protocol';
import { createNonce, prove, verify } from '@geordi/protocol/auth';
import { adapterFor } from './agents/adapter.ts';
import { changes, diff } from './changes.ts';
import { closeTerminals, openTerminal, resizeTerminal, writeTerminal } from './terminals.ts';
import { runTurn, type Turn } from './turn.ts';
import { ensureWorktree, locateWorktree } from './worktree.ts';

const forgeUrl = new URL(process.env.GEORDI_FORGE_URL || 'ws://127.0.0.1:7700');
const worktreesDir = process.env.GEORDI_WORKTREES_DIR || join(homedir(), '.geordi', 'worktrees');
const tokenFile =
	process.env.GEORDI_DAEMON_TOKEN_FILE || join(homedir(), '.geordi', 'daemon-token');
const daemonId = hostname();

// Unencrypted connections are only acceptable on this machine.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
if (forgeUrl.protocol !== 'wss:' && !LOOPBACK.has(forgeUrl.hostname)) {
	console.error(`Refusing unencrypted connection to ${forgeUrl.host}; use wss://`);
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

const turns = new Map<string, Turn>();

// --- Connection to the forge --------------------------------------------------------------

/** The current connection, set only once the forge has proven it knows the token. */
let socket: WebSocket | null = null;
/** Messages produced while disconnected; sent once the next connection is authenticated. */
const outbox: DaemonMessage[] = [];

function send(message: DaemonMessage) {
	if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
	else outbox.push(message);
}

/** For messages that only matter to a forge that is listening right now (terminal I/O). */
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
				running: [...turns.keys()]
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
		if (socket === ws) {
			socket = null;
			// The forge keeps the scrollback; without it, running shells are unreachable.
			closeTerminals();
		}
		retry();
	};
}

// --- Handling forge commands ----------------------------------------------------------------

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function answer(request: DaemonRequest) {
	const worktree = locateWorktree(worktreesDir, request.repoPath, request.workspaceId);
	switch (request.kind) {
		case 'changes':
			return changes(worktree, request.repoPath);
		case 'diff':
			return diff(worktree, request.repoPath, request.path);
	}
}

async function handle(message: ForgeMessage) {
	switch (message.type) {
		case 'turn.start': {
			const { sessionId, workspaceId, agent, repoPath, resumeId, prompt } = message;
			const emit = (event: SessionEvent) => send({ type: 'session.event', sessionId, event });

			if (turns.has(sessionId))
				return emit({ kind: 'turn.failed', error: 'A turn is already running' });

			try {
				const worktree = ensureWorktree(worktreesDir, repoPath, workspaceId);
				if (worktree.created)
					emit({ kind: 'worktree', path: worktree.path, branch: worktree.branch });

				const adapter = await adapterFor(agent);
				const turn = runTurn(
					adapter,
					{
						sessionId,
						prompt,
						resumeId,
						cwd: worktree.path,
						writableRoots: worktree.writableRoots
					},
					emit
				);
				turns.set(sessionId, turn);
				turn.done.then(() => turns.delete(sessionId));
			} catch (error) {
				emit({ kind: 'turn.failed', error: errorMessage(error) });
			}
			break;
		}

		case 'request':
			try {
				send({ type: 'response', id: message.id, result: answer(message.request) });
			} catch (error) {
				send({ type: 'response', id: message.id, error: errorMessage(error) });
			}
			break;

		case 'terminal.open': {
			const { workspaceId } = message;
			const output = (data: string) => sendLive({ type: 'terminal.output', workspaceId, data });
			const exit = () => sendLive({ type: 'terminal.exit', workspaceId });
			try {
				const { path } = locateWorktree(worktreesDir, message.repoPath, workspaceId);
				openTerminal(workspaceId, path, message, output, exit);
			} catch (error) {
				output(`${errorMessage(error)}\r\n`);
				exit();
			}
			break;
		}

		case 'terminal.input':
			writeTerminal(message.workspaceId, message.data);
			break;

		case 'terminal.resize':
			resizeTerminal(message.workspaceId, message);
			break;

		case 'turn.stop':
			turns.get(message.sessionId)?.stop();
			break;

		default:
			break; // handshake messages are handled in connect()
	}
}

process.on('SIGINT', () => {
	for (const turn of turns.values()) turn.stop();
	closeTerminals();
	process.exit(0);
});

console.log(`geordi daemon ${daemonId}, worktrees in ${worktreesDir}`);
connect();
