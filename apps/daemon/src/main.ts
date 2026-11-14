import { readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import {
	PROTOCOL_VERSION,
	type DaemonMessage,
	type ForgeMessage,
	type SessionEvent
} from '@geordi/protocol';
import { adapterFor } from './agents/adapter.ts';
import { runTurn, type Turn } from './turn.ts';
import { ensureWorktree } from './worktree.ts';

const forgeUrl = process.env.GEORDI_FORGE_URL || 'ws://127.0.0.1:7700';
const worktreesDir = process.env.GEORDI_WORKTREES_DIR || join(homedir(), '.geordi', 'worktrees');
const tokenFile =
	process.env.GEORDI_DAEMON_TOKEN_FILE || join(homedir(), '.geordi', 'daemon-token');
const daemonId = hostname();

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

let socket: WebSocket | null = null;
/** Messages produced while disconnected; sent after the next `hello`. */
const outbox: DaemonMessage[] = [];

function send(message: DaemonMessage) {
	if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
	else outbox.push(message);
}

function connect(delay = 500) {
	const retry = () => setTimeout(() => connect(Math.min(delay * 2, 5000)), delay);

	const token = readToken();
	if (!token) {
		console.log(`waiting for the forge's token in ${tokenFile}`);
		return retry();
	}

	const ws = new WebSocket(forgeUrl);

	ws.onopen = () => {
		console.log(`connected to ${forgeUrl}`);
		socket = ws;
		delay = 500;
		const hello: DaemonMessage = {
			type: 'hello',
			protocol: PROTOCOL_VERSION,
			token,
			daemonId,
			running: [...turns.keys()]
		};
		ws.send(JSON.stringify(hello));
		for (const message of outbox.splice(0)) ws.send(JSON.stringify(message));
	};

	ws.onmessage = (event) => handle(JSON.parse(String(event.data)) as ForgeMessage);

	ws.onclose = (event) => {
		if (socket === ws) console.log('disconnected; reconnecting');
		else if (event.reason) console.log(`connection refused: ${event.reason}`);
		socket = null;
		retry();
	};
}

// --- Handling forge commands ----------------------------------------------------------------

async function handle(message: ForgeMessage) {
	switch (message.type) {
		case 'turn.start': {
			const { sessionId, agent, repoPath, resumeId, prompt } = message;
			const emit = (event: SessionEvent) => send({ type: 'session.event', sessionId, event });

			if (turns.has(sessionId))
				return emit({ kind: 'turn.failed', error: 'A turn is already running' });

			try {
				const worktree = ensureWorktree(worktreesDir, repoPath, sessionId);
				if (worktree.created)
					emit({ kind: 'worktree', path: worktree.path, branch: worktree.branch });

				const adapter = await adapterFor(agent);
				const turn = runTurn(
					adapter,
					{ sessionId, prompt, resumeId, cwd: worktree.path, gitDir: worktree.gitDir },
					emit
				);
				turns.set(sessionId, turn);
				turn.done.then(() => turns.delete(sessionId));
			} catch (error) {
				emit({
					kind: 'turn.failed',
					error: error instanceof Error ? error.message : String(error)
				});
			}
			break;
		}

		case 'turn.stop':
			turns.get(message.sessionId)?.stop();
			break;
	}
}

process.on('SIGINT', () => {
	for (const turn of turns.values()) turn.stop();
	process.exit(0);
});

console.log(`geordi daemon ${daemonId}, worktrees in ${worktreesDir}`);
connect();
