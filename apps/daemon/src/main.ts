import { repoIcon } from './icon.ts';
import { readPicture } from './picture.ts';
import { readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import {
	DEFAULT_PORTS,
	AGENTS,
	JOB_TERMINAL,
	TEARDOWN_TIMEOUT_MS,
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
import { changes, readText, status, uncommittedFiles, versions } from './changes.ts';
import { resolve, settingsOf } from './config.ts';
import { createPorts, portEnv, waitForPort } from './ports.ts';
import {
	closeTerminal,
	closeTerminals,
	openTerminal,
	resizeTerminal,
	endedTerminals,
	runningTerminals,
	scrollbackOf,
	writeTerminal
} from './terminals.ts';
import { releasePlan } from './releases.ts';
import { emptyTrash, removable, removeWorktree } from './remove.ts';
import { setupNote } from './scripts.ts';
import { titleFor } from './titles.ts';
import {
	endLegacyTurns,
	resumeSessions,
	startSession,
	type Said,
	type Session
} from './session.ts';
import type { Meta } from './host.ts';
import { update } from './update.ts';
import { markReady, mergePull, upstream } from './upstream.ts';
import { createWatches } from './watch.ts';
import {
	branchOf,
	continueOn,
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
/** Where agents' sessions keep what they are told and what they do, so that they outlive this process (ADR-007). */
const sessionsDir = process.env.GEORDI_SESSIONS_DIR || join(homedir(), '.geordi', 'sessions');
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
const RUN_CHANGED = `echo 'This is not the command you agreed to run: the repository'"'"'s Geordi configuration has changed. Start it again to see and run what it says now.'; exit 1`;

/** What the terminal of a script that did not run says instead. Words of ours, never the file's. */
const SETUP_NOT_RUN = {
	unagreed: `echo 'The setup script in the repository'"'"'s Geordi configuration did not run: nobody has agreed to it yet. The workspace says so at its top: review it there to see it and agree to it.'; exit 1`,
	agents: `echo 'The setup script in the repository'"'"'s Geordi configuration did not run by itself: this directory holds what an agent wrote (it starts from an agent'"'"'s branch, or was brought back from this workspace'"'"'s). To run it all the same: press Enter here, then any key.'; exit 1`
};

/** What a terminal's output and its end are sent as. */
function relay(terminalId: string) {
	return {
		output: (data: string, offset = 0) =>
			sendLive({ type: 'terminal.output', terminalId, data, offset }),
		exit: () => sendLive({ type: 'terminal.exit', terminalId })
	};
}

/**
 * Runs a command of the repository's in a terminal of its own, for whoever looks to see,
 * and resolves once the command has ended: with its status (`null` if the terminal was
 * closed first, or it ran out of `timeoutMs`) and what it put out.
 */
function runScript(
	worktree: Worktree,
	terminalId: string,
	command: string,
	env: Record<string, string>,
	{ timeoutMs, setup }: { timeoutMs?: number; setup?: string } = {}
): Promise<{ status: number | null; output: string }> {
	const { output, exit } = relay(terminalId);
	return new Promise((resolve) => {
		if (runningTerminals().includes(terminalId)) return resolve({ status: null, output: '' });
		const timer = timeoutMs ? setTimeout(() => closeTerminal(terminalId), timeoutMs) : undefined;
		openTerminal(
			terminalId,
			worktree.path,
			{
				cols: 120,
				rows: 30,
				closeOnSuccess: setup !== undefined,
				command,
				env,
				onEnded: (status) => {
					clearTimeout(timer);
					if (status !== null) sendLive({ type: 'terminal.ended', terminalId, status });
					resolve({ status, output: scrollbackOf(terminalId)?.data ?? '' });
				}
			},
			() => verifyLinks(worktree),
			output,
			exit
		);
		// a setup's terminal, started again, runs the setup script again
		sendLive({
			type: 'terminal.opened',
			terminalId,
			...(setup && { run: { job: 'setup', command: setup } })
		});
	});
}

/**
 * The setup scripts of worktrees made just now (FDR-006), by worktree: a turn there waits
 * for it, and its agent is told how it went (what this resolves to; `null` for nothing).
 */
const setups = new Map<string, Promise<string | null>>();

/**
 * Runs the repository's setup script in a worktree that was just made (or brought back).
 *
 * By itself, unseen, it runs only what is the person's: a command they agreed to, in a
 * directory fresh from where their work starts. What it runs is the directory's as much as
 * the command's (`pnpm install` runs the package's scripts), so in one that starts from an
 * agent's branch (`base`), or comes back from the workspace's own, it would run what an
 * agent wrote, outside its sandbox, with nobody asking for it. There it is the agent's to do,
 * in its sandbox, or the person's, once they have reviewed it.
 */
function setUp(worktree: Worktree & { created: boolean }, ref: WorktreeRef) {
	const terminalId = `${ref.worktreeId}:${JOB_TERMINAL}setup`;
	const done = (async () => {
		const { config, env } = await configFor(worktree, ref);
		const { setup } = config;
		if (!setup) return null;
		// one that may not run by itself doesn't; its terminal says why, and where to run it
		const reason = !setup.approved ? 'unagreed' : !worktree.created || ref.base ? 'agents' : null;
		if (reason) {
			void runScript(worktree, terminalId, SETUP_NOT_RUN[reason], env, { setup: setup.command });
			return setupNote(setup, reason);
		}
		const ran = await runScript(worktree, terminalId, setup.command, env, {
			setup: setup.command
		});
		return setupNote(setup, ran);
	})().catch((error) => {
		console.warn(`setup in ${worktree.path}: ${errorMessage(error)}`);
		return null;
	});
	setups.set(ref.worktreeId, done);
}

/**
 * Runs the repository's teardown script in a worktree about to be removed, if a person has
 * agreed to it. However it ends, the worktree goes: a broken script must not keep it.
 */
async function tearDown(worktree: Worktree, ref: WorktreeRef) {
	try {
		verifyLinks(worktree); // it runs as the person, in a directory the agent could have rewired
		const { config, env } = await configFor(worktree, ref);
		const { teardown } = config;
		if (!teardown?.approved) return;
		const terminalId = `${ref.worktreeId}:${JOB_TERMINAL}teardown`;
		const { status } = await runScript(worktree, terminalId, teardown.command, env, {
			timeoutMs: TEARDOWN_TIMEOUT_MS
		});
		closeTerminal(terminalId);
		if (status !== 0) console.warn(`teardown in ${worktree.path} ended with status ${status}`);
	} catch (error) {
		console.warn(`teardown in ${worktree.path}: ${errorMessage(error)}`);
	}
}

/** Agents waiting for their worktree's setup, by workspace: what stops one. */
const waiting = new Map<string, () => void>();

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
// Keep the host line until the forge acknowledges its durable append. One in flight per workspace.
const deliveries = new Map<string, { cursor: string; sent: number; acknowledged: boolean }>();
const emitFor = (workspaceId: string) => (event: AgentEvent, cursor?: string) => {
	if (!cursor) {
		send({ type: 'workspace.event', workspaceId, event });
		return true;
	}
	const pending = deliveries.get(workspaceId);
	if (pending?.cursor === cursor) {
		if (pending.acknowledged) {
			deliveries.delete(workspaceId);
			return true;
		}
		if (Date.now() - pending.sent < 1000) return false;
	}
	deliveries.set(workspaceId, { cursor, sent: Date.now(), acknowledged: false });
	sendLive({ type: 'workspace.event', workspaceId, event, cursor });
	return false;
};

/**
 * Whether the forge is there to be told things. Sessions are only followed while it is: what
 * they write waits in their files, which survive us, rather than in the outbox, which doesn't.
 */
const connected = () => socket?.readyState === WebSocket.OPEN;

endLegacyTurns(join(sessionsDir, '..', 'turns'));
/** The agents' sessions (ADR-010), by workspace: ones we started, and ones we found running. */
const sessions = resumeSessions(sessionsDir, emitFor, connected);
for (const [workspaceId, session] of sessions) attend(workspaceId, session);

/** Starts a workspace's session with what is to be said to it, the first thing first. */
function begin(workspaceId: string, meta: Meta, [first, ...rest]: Said[]) {
	const dir = join(sessionsDir, workspaceId);
	const options = { ...meta.options, dir };
	const session = startSession({ ...meta, options }, first, emitFor(workspaceId), dir, connected);
	rest.forEach(session.say);
	sessions.set(workspaceId, session);
	attend(workspaceId, session);
}

/**
 * Forgets a session once it is over. What was said to it too late (its CLI had just been
 * ended, for having nothing to do) is said to a new one, which carries on where it left off.
 */
function attend(workspaceId: string, session: Session) {
	void session.done.then((unheard) => {
		if (sessions.get(workspaceId) === session) sessions.delete(workspaceId);
		if (unheard.length === 0) return;
		const { agent, options, apiToken } = session;
		try {
			begin(
				workspaceId,
				{ agent, apiToken, options: { ...options, resumeId: session.resumeId() } },
				unheard
			);
		} catch (error) {
			emitFor(workspaceId)({ kind: 'turn.failed', error: errorMessage(error) });
		}
	});
}

/**
 * Workspaces whose session is about to start (its worktree is being made, or set up), with
 * what was said to them since: all of it is the new session's to hear.
 */
const beginning = new Map<string, Said[]>();

/**
 * The workspaces whose agent the forge takes to be at work, and must not give up: those at
 * work as far as it was told, those about to start, and those with events waiting in the
 * outbox. Leaving the latter out would have the forge give them up as lost, a moment before
 * their ending arrives.
 */
const unreported = () => [
	...new Set([
		...[...sessions].flatMap(([id, session]) => (session.working() ? [id] : [])),
		...beginning.keys(),
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
				sessions: [...sessions.keys()],
				terminals: runningTerminals(),
				ended: endedTerminals(),
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
		// Agents and terminals keep running: the forge picks them up again when it is back.
		if (socket === ws) socket = null;
		retry();
	};
}

// --- Handling forge commands ----------------------------------------------------------------

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function answer(request: DaemonRequest) {
	if (request.kind === 'scrollback') return scrollbackOf(request.terminalId);
	if (request.kind === 'title') return titleFor(request.text);
	if (request.kind === 'repoIcon') return repoIcon(request.repoPath);
	if (request.kind === 'removeWorktree') {
		const { repoPath, worktreeId, force } = request;
		const worktree = removable(worktreesDir, repoPath, worktreeId, force);
		if (worktree && request.teardown) await tearDown(worktree, request);
		// what it comes back from if the workspace is brought back, which the agent may have renamed
		let branch: string | null = null;
		try {
			if (worktree) branch = branchOf(worktree);
		} catch {
			// an unreadable HEAD (forced removal of a tampered worktree): the forge keeps what it knows
		}
		// an agent whose CLI is still running there (with nothing to do) goes with its directory
		for (const session of sessions.values())
			if (worktree && session.options.cwd === worktree.path) session.kill();
		removeWorktree(worktreesDir, repoPath, worktreeId, force);
		setups.delete(worktreeId);
		ports.release(request.worktreeId); // the workspace is gone: its ports are anyone's again
		return { branch };
	}
	if (request.kind === 'approveRun') {
		for (const command of request.commands) approvals.add(request.repoPath, command);
		sendLive({ type: 'worktree.changed', worktreeId: request.worktreeId }); // it shows as agreed to
		return null;
	}
	if (request.kind === 'portReady')
		return waitForPort(request.port, Math.min(request.timeoutMs, 120_000));
	if (request.kind === 'continueWorktree') {
		const { repoPath, worktreeId } = request;
		const worktree = locateWorktree(worktreesDir, repoPath, worktreeId);
		if (sessions.get(worktreeId)?.working()) throw new Error('Its agent is still at work');
		if (uncommittedFiles(worktree).length > 0)
			throw new Error('It has uncommitted changes: commit or discard them first');
		// from where the upstream stands now, as a new workspace would
		const problem = await fetchUpstream(repoPath);
		if (problem) console.warn(`could not fetch ${repoPath}: ${problem}`);
		const branch = continueOn(worktree, repoPath);
		sendLive({ type: 'worktree.changed', worktreeId });
		return { branch };
	}
	if (request.kind === 'prepareWorktree') {
		const { repoPath, worktreeId, base, branch } = request;
		// a new one starts from where its upstream stands now, as with a first turn
		if (!base && !hasWorktree(worktreesDir, repoPath, worktreeId)) {
			const problem = await fetchUpstream(repoPath);
			if (problem) console.warn(`could not fetch ${repoPath}: ${problem}`);
		}
		const worktree = ensureWorktree(worktreesDir, repoPath, worktreeId, base, branch);
		if (worktree.created || worktree.restored) setUp(worktree, request);
		watches.restart(worktreeId);
		sendLive({ type: 'worktree.changed', worktreeId });
		return { path: worktree.path, branch: worktree.branch };
	}

	const worktree = locateWorktree(worktreesDir, request.repoPath, request.worktreeId);
	switch (request.kind) {
		case 'changes':
			return status(worktree, request);
		case 'release':
			// which notes are this workspace's: the files it has added
			return releasePlan(
				worktree,
				() =>
					new Set(
						changes(worktree, request)
							.filter((file) => file.status === 'added')
							.map((file) => file.path)
					),
				(command) => approvals.has(request.repoPath, command)
			);
		case 'config':
			return (await configFor(worktree, request)).config;
		case 'diff':
			return versions(worktree, request, request.path);
		case 'source':
			return readText(worktree, request.path);
		case 'picture':
			return readPicture(worktree.path, request.path);
		case 'upstream':
			return upstream(worktree, request);
		case 'markReady':
			return markReady(worktree, request);
		case 'mergePull': {
			const status = await mergePull(worktree, request);
			// The merge is a new commit upstream: fetching it lets every workspace of the
			// repository see it (their watchers notice the refs change). Not waited for.
			if (status === 'merged')
				void fetchUpstream(request.repoPath).then((problem) => {
					if (problem) console.warn(`could not fetch ${request.repoPath}: ${problem}`);
				});
			return status;
		}
		case 'updateWorktree':
			return !sessions.get(request.worktreeId)?.working() && update(worktree, request);
	}
}

async function handle(message: ForgeMessage) {
	switch (message.type) {
		case 'workspace.ack': {
			const pending = deliveries.get(message.workspaceId);
			if (pending?.cursor === message.cursor) pending.acknowledged = true;
			return;
		}
		case 'agent.message': {
			const { workspaceId, worktreeId, agent, repoPath, base, settings } = message;
			const emit = emitFor(workspaceId);
			const said: Said = {
				prompt: message.prompt,
				deliveryId: message.deliveryId,
				...(message.images && { images: message.images })
			};

			// one that is about to start hears it when it does
			const sooner = beginning.get(workspaceId);
			if (sooner) {
				sooner.push(said);
				break;
			}
			const heard = [said];
			beginning.set(workspaceId, heard);
			try {
				let session = sessions.get(workspaceId);
				// A CLI runs as it was started. Told to run otherwise (with another model, say), it
				// is started anew, unless it is in the middle of something: then that waits.
				const same = JSON.stringify(session?.options.settings) === JSON.stringify(settings);
				if (session && !session.over() && !session.working() && !same) {
					session.close();
					await Promise.race([session.done, new Promise((resolve) => setTimeout(resolve, 15_000))]);
					session = sessions.get(workspaceId);
				}
				// An agent whose CLI is running is simply told: between turns that starts one,
				// during a turn it steers.
				if (session && !session.over()) {
					heard.forEach(session.say);
					break;
				}

				// A workspace of its own starts from where its upstream stands now. (One started
				// by an agent starts from that agent's branch, which is here already.)
				if (!base && !hasWorktree(worktreesDir, repoPath, worktreeId)) {
					const problem = await fetchUpstream(repoPath);
					if (problem) console.warn(`could not fetch ${repoPath}: ${problem}`);
				}
				const worktree = ensureWorktree(worktreesDir, repoPath, worktreeId, base, message.branch);
				if (worktree.created)
					emit({ kind: 'worktree', path: worktree.path, branch: worktree.branch });
				if (worktree.created || worktree.restored) {
					// there is a directory to watch now (again), and to look at
					watches.restart(worktreeId);
					sendLive({ type: 'worktree.changed', worktreeId });
					setUp(worktree, message);
				}

				// The agent starts once the directory is set up, and hears how that went. Stopped
				// meanwhile, the turn ends; the setup goes on, for the next one to wait for.
				const setup = setups.get(worktreeId);
				if (setup) {
					const stopped = new Promise<'stopped'>((resolve) =>
						waiting.set(workspaceId, () => resolve('stopped'))
					);
					let note;
					try {
						note = await Promise.race([setup, stopped]);
					} finally {
						waiting.delete(workspaceId);
					}
					if (note === 'stopped') {
						emit({ kind: 'turn.failed', error: 'Stopped' });
						break;
					}
					if (setups.get(worktreeId) === setup) setups.delete(worktreeId);
					if (note) heard[0] = { ...said, prompt: `${note}\n\n${said.prompt}` };
				}

				const options = {
					sessionId: workspaceId,
					dir: '', // `begin` knows where
					resumeId: message.resumeId,
					settings,
					env: (await configFor(worktree, message)).env,
					instructions: message.instructions,
					cwd: worktree.path,
					writableRoots: worktree.writableRoots,
					api: { url: apiUrl }
				};
				begin(workspaceId, { agent, options, apiToken: message.apiToken }, heard);
			} catch (error) {
				emit({ kind: 'turn.failed', error: errorMessage(error) });
			} finally {
				beginning.delete(workspaceId);
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
			const { output, exit } = relay(terminalId);
			try {
				const worktree = locateWorktree(worktreesDir, message.repoPath, message.worktreeId);
				const guard = () => verifyLinks(worktree);
				const { config, env } = await configFor(worktree, message);
				// A job runs only as the person asking saw it, and has agreed to run it (FDR-006):
				// the file is the agent's to change, also in the moment between their looking at
				// the command and their asking for it. Otherwise the terminal says so, in words
				// of ours, and nothing of the file's runs.
				const asked = message.run;
				// the setup script can be run again by hand: as a job without a port
				const job =
					asked?.job === 'setup'
						? config.setup && { ...config.setup, port: null }
						: config.jobs.find((job) => job.name === asked?.job);
				const agreed = job && job.command === asked?.command && job.approved;
				openTerminal(
					terminalId,
					worktree.path,
					{
						...message,
						closeOnSuccess: asked?.job === 'setup',
						command: asked && (agreed ? job.command : RUN_CHANGED),
						// every terminal knows the workspace's ports; a job also which one is its own
						env: { ...env, ...(agreed && job.port !== null && { PORT: String(job.port) }) },
						// a job that has ended is no longer running, though its terminal is still there
						onEnded: (status) =>
							status !== null && sendLive({ type: 'terminal.ended', terminalId, status })
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

		case 'agent.stop':
			sessions.get(message.workspaceId)?.stop();
			waiting.get(message.workspaceId)?.();
			break;

		case 'agent.answer':
			sessions.get(message.workspaceId)?.answer(message.questionId, message.answers);
			break;

		default:
			break; // handshake messages are handled in connect()
	}
}

// Ctrl+C is someone stopping Geordi: the agents stop with it. Any other way of going away
// (a restart, a crash, being replaced) leaves them working for the next daemon to pick up.
process.on('SIGINT', () => {
	for (const session of sessions.values()) session.kill();
	closeTerminals();
	process.exit(0);
});

emptyTrash(worktreesDir);
console.log(`geordi daemon ${daemonId}, worktrees in ${worktreesDir}`);
connect();
