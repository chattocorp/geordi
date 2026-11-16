import { readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import {
	CONFIG_FILE,
	DEFAULT_PORTS,
	AGENTS,
	PROTOCOL_VERSION,
	type DaemonMessage,
	type DaemonRequest,
	type ForgeMessage,
	type AgentEvent,
	type Harness,
	type WorktreeRef
} from '@geordi/protocol';
import { createNonce, prove, verify } from '@geordi/protocol/auth';
import { adapterFor } from './agents/adapter.ts';
import { createApprovals } from './approvals.ts';
import { status, versions } from './changes.ts';
import { resolve, settingsOf } from './config.ts';
import { createPorts, portEnv, waitForPort } from './ports.ts';
import {
	closeTerminal,
	closeTerminals,
	openTerminal,
	resizeTerminal,
	runningTerminals,
	scrollbackOf,
	writeTerminal
} from './terminals.ts';
import { emptyTrash, removeWorktree } from './remove.ts';
import { titleFor } from './titles.ts';
import { resumeTurns, runTurn, type Turn } from './turn.ts';
import { mergePull, upstream } from './upstream.ts';
import { createWatches } from './watch.ts';
import {
	ensureWorktree,
	fetchUpstream,
	hasWorktree,
	locateWorktree,
	verifyLinks,
	type Worktree
} from './worktree.ts';

const forgeUrl = new URL(process.env.GEORDI_FORGE_URL || 'ws://127.0.0.1:7700');
/** Where agents on this machine reach the forge's agent API (ADR-004). */
const apiUrl = new URL('/mcp', process.env.GEORDI_FORGE_HTTP_URL || 'http://127.0.0.1:3000').href;
const worktreesDir = process.env.GEORDI_WORKTREES_DIR || join(homedir(), '.geordi', 'worktrees');
/** Where running agent turns keep their output, so that they outlive this process (ADR-007). */
const turnsDir = process.env.GEORDI_TURNS_DIR || join(homedir(), '.geordi', 'turns');
const tokenFile =
	process.env.GEORDI_DAEMON_TOKEN_FILE || join(homedir(), '.geordi', 'daemon-token');
const daemonId = hostname();
/** The models and effort levels this machine's agent CLIs offer; told to the forge. */
const harnesses: Harness[] = await Promise.all(
	AGENTS.map(async (agent) => ({ agent, ...(await adapterFor(agent)).offers() }))
);

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

/** The run commands people have agreed to run (FDR-006), kept where no agent's sandbox can write. */
const approvals = createApprovals(
	process.env.GEORDI_RUN_APPROVALS_FILE || join(homedir(), '.geordi', 'run-approvals.json')
);

/** The ports of workspaces (FDR-006): theirs for as long as they live, so they are written down. */
const ports = createPorts(
	process.env.GEORDI_PORTS_FILE || join(homedir(), '.geordi', 'ports.json')
);

/**
 * What the repository's configuration says for a workspace, with its ports. Asking is what
 * gives a workspace its ports, and a job its own among them, the first time around.
 */
async function configFor(worktree: Worktree, { repoPath, worktreeId }: WorktreeRef) {
	const found = settingsOf(worktree, repoPath);
	const assigned = await ports.ensure(
		worktreeId,
		found.settings?.ports ?? DEFAULT_PORTS,
		found.settings?.jobs.map((job) => job.name)
	);
	const config = resolve(found, assigned, (command) => approvals.has(repoPath, command));
	return { config, env: portEnv(assigned) };
}

/** What a job's terminal runs when its command is not one that was seen and agreed to. */
const RUN_CHANGED = `echo 'This is not the command you agreed to run: ${CONFIG_FILE} has changed. Start it again to see and run what it says now.'; exit 1`;

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
const emitFor = (workspaceId: string, turn?: number) => (event: AgentEvent) =>
	send({ type: 'workspace.event', workspaceId, turn, event });

/** The turns running right now, by workspace: ones we started, and ones we found running. */
/**
 * Whether the forge is there to be told things. Turns are only followed while it is: what
 * they write waits in their files, which survive us, rather than in the outbox, which doesn't.
 */
const connected = () => socket?.readyState === WebSocket.OPEN;

const turns = await resumeTurns(turnsDir, adapterFor, emitFor, connected);
for (const [workspaceId, turn] of turns) forget(workspaceId, turn);

function forget(workspaceId: string, turn: Turn) {
	turn.done.then(() => {
		if (turns.get(workspaceId) === turn) turns.delete(workspaceId);
	});
}

/** Workspaces whose next turn is about to start, once the one before it has gone. */
const starting = new Set<string>();

/**
 * The workspaces whose turn the forge has not heard the end of: those still running, those
 * about to start, and those with events waiting in the outbox. Leaving
 * the latter out would have the forge give them up as lost, a moment before their ending
 * arrives.
 */
const unreported = () => [
	...new Set([
		...turns.keys(),
		...starting,
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
	// never long: until we are connected, nobody can start an agent
	const retry = () => setTimeout(() => connect(Math.min(delay * 2, 2000)), delay);

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

		if (socket === ws)
			return handle(message).catch((error) =>
				console.error('could not handle', message.type, error)
			);

		// Handshake (see @geordi/protocol/auth): answer the challenge, then verify the forge.
		if (message.type === 'challenge') {
			const hello: DaemonMessage = {
				type: 'hello',
				protocol: PROTOCOL_VERSION,
				daemonId,
				nonce,
				proof: prove(token, 'daemon', message.nonce),
				running: unreported(),
				terminals: runningTerminals(),
				harnesses
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
		ports.release(request.worktreeId); // the workspace is gone: its ports are anyone's again
		return null;
	}
	if (request.kind === 'approveRun') {
		for (const command of request.commands) approvals.add(request.repoPath, command);
		sendLive({ type: 'worktree.changed', worktreeId: request.worktreeId }); // it shows as agreed to
		return null;
	}
	if (request.kind === 'portReady')
		return waitForPort(request.port, Math.min(request.timeoutMs, 120_000));
	if (request.kind === 'restoreWorktree') {
		const { repoPath, worktreeId, base } = request;
		ensureWorktree(worktreesDir, repoPath, worktreeId, base);
		watches.restart(worktreeId);
		sendLive({ type: 'worktree.changed', worktreeId });
		return null;
	}

	const worktree = locateWorktree(worktreesDir, request.repoPath, request.worktreeId);
	switch (request.kind) {
		case 'changes':
			return status(worktree, request);
		case 'config':
			return (await configFor(worktree, request)).config;
		case 'diff':
			return versions(worktree, request, request.path);
		case 'upstream':
			return upstream(worktree, request);
		case 'mergePull':
			return mergePull(worktree, request);
	}
}

async function handle(message: ForgeMessage) {
	switch (message.type) {
		case 'turn.start': {
			const { workspaceId, worktreeId, agent, repoPath, base, resumeId, prompt } = message;
			const emit = emitFor(workspaceId, message.turn);

			// The forge only starts a turn when it knows of none. If we still have one (the forge
			// gave up on it while we were apart, say), it has to go first: two agents must never
			// be at work in one conversation. It gets a moment to end, then is stopped, and if
			// even that leads nowhere we let go of it.
			const previous = turns.get(workspaceId);
			if (previous) {
				starting.add(workspaceId);
				try {
					const within = (ms: number) =>
						Promise.race([previous.done, new Promise((resolve) => setTimeout(resolve, ms))]);
					await within(10_000);
					if (turns.get(workspaceId) === previous) {
						previous.stop();
						await within(15_000);
						previous.detach();
					}
				} finally {
					starting.delete(workspaceId);
				}
			}

			try {
				// A workspace of its own starts from where its upstream stands now. (One started
				// by an agent starts from that agent's branch, which is here already.)
				if (!base && !hasWorktree(worktreesDir, repoPath, worktreeId)) {
					const problem = await fetchUpstream(repoPath);
					if (problem) console.warn(`could not fetch ${repoPath}: ${problem}`);
				}
				const worktree = ensureWorktree(worktreesDir, repoPath, worktreeId, base);
				if (worktree.created)
					emit({ kind: 'worktree', path: worktree.path, branch: worktree.branch });
				if (worktree.created || worktree.restored) {
					// there is a directory to watch now (again), and to look at
					watches.restart(worktreeId);
					sendLive({ type: 'worktree.changed', worktreeId });
				}

				const adapter = await adapterFor(agent);
				const turn = runTurn(
					adapter,
					{ agent, turn: message.turn },
					{
						sessionId: workspaceId,
						prompt,
						resumeId,
						settings: message.settings,
						env: (await configFor(worktree, message)).env,
						instructions: message.instructions,
						cwd: worktree.path,
						writableRoots: worktree.writableRoots,
						api: { url: apiUrl }
					},
					emit,
					join(turnsDir, workspaceId),
					message.apiToken,
					connected
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
				const { config, env } = await configFor(worktree, message);
				// A job runs only as the person asking saw it, and has agreed to run it (FDR-006):
				// the file is the agent's to change, also in the moment between their looking at
				// the command and their asking for it. Otherwise the terminal says so, in words
				// of ours, and nothing of the file's runs.
				const asked = message.run;
				const job = config.jobs.find((job) => job.name === asked?.job);
				const agreed = job && job.command === asked?.command && job.approved;
				openTerminal(
					terminalId,
					worktree.path,
					{
						...message,
						command: asked && (agreed ? job.command : RUN_CHANGED),
						// every terminal knows the workspace's ports; a job also which one is its own
						env: { ...env, ...(agreed && { PORT: String(job.port) }) }
					},
					guard,
					output,
					exit
				);
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

emptyTrash(worktreesDir);
console.log(`geordi daemon ${daemonId}, worktrees in ${worktreesDir}`);
connect();
