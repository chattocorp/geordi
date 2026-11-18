import { linesFrom } from './journal.ts';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
	appendFileSync,
	chmodSync,
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentEvent, BackgroundTask, MessageImage } from '@geordi/protocol';
import type { Command, Exit, HostEvent, Meta } from './host.ts';

/**
 * An agent's session (ADR-010): its CLI, running for as long as it has something to do, with
 * a host process of its own that talks to it (`host.ts`). Both run detached from the daemon
 * (ADR-007), which tells the host things by appending to a file and follows what happens in
 * another. A daemon that restarts finds the sessions still running and carries on where it
 * left off, so restarting it (or it crashing) costs no work.
 *
 * On top of what the host keeps there, a session's directory holds:
 * - `host.json`: the host's process, to signal (and when it started, to know it again)
 * - `offset`: how much of `out.jsonl` has been passed on
 * - `expecting`: present while a message was sent that no turn has been reported for yet
 */

/** Something said to an agent. */
export type Said = { deliveryId?: string; prompt: string; images?: MessageImage[] };

type Deliver = (event: HostEvent, cursor?: string) => unknown;

export type Session = Meta & {
	/** Says something to the agent: it starts a turn, or steers the one under way. */
	say(said: Said): void;
	/** Follow newly acknowledged output immediately. */
	read(): void;
	/** Stops the turn under way. The session goes on. */
	stop(): void;
	answer(id: string, answers: string[]): void;
	/** Ends the session's CLI, to be started anew with the next thing said. */
	close(): void;
	/** Ends the session's processes, as someone stopping Geordi does. A turn under way fails as "Stopped". */
	kill(): void;
	/** Stops following the session without ending it, as a daemon going away does. */
	detach(): void;
	/**
	 * Whether the agent is at work, as far as has been passed on: a turn was reported and not
	 * its end, or a message was sent that the report of a turn is still to come for.
	 */
	working(): boolean;
	background(): BackgroundTask[];
	/** Whether the session is over: there is nobody to say anything to any more. */
	over(): boolean;
	/** The CLI's own ID of the conversation, as last heard. */
	resumeId(): string | null;
	/** Resolves when the session is over, with what was said to it too late to reach its CLI. */
	done: Promise<Said[]>;
};

/** How often a session's files are looked at. */
const POLL_MS = 100;
/** How long processes told to end get before they are killed. */
const KILL_AFTER_MS = 10_000;

/** The host's program: next to this file, or (bundled, in the app) next to the daemon's. */
const HOST = fileURLToPath(
	new URL(import.meta.url.endsWith('.ts') ? './host.ts' : './host.js', import.meta.url)
);

/** When a process started, as `ps` puts it; `null` if there is no such process. */
function startedAt(pid: number): string | null {
	try {
		const started = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
		return started || null;
	} catch {
		return null;
	}
}

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

/**
 * Follows a session: passes on what its host has written since `offset`, and guarantees
 * that a turn which began also ends (`turn.completed` or `turn.failed`), whatever becomes of
 * the host.
 *
 * Nothing is read while `ready()` says there is nobody to tell: the files are the queue,
 * and an event only counts as passed on (`offset`) once it could be sent. So a daemon that
 * goes away while the forge is away too loses nothing either.
 */
function follow(dir: string, emit: Deliver, ready: () => boolean): Session {
	const file = (name: string) => join(dir, name);
	const meta = JSON.parse(readFileSync(file('meta.json'), 'utf8')) as Meta & { generation: string };
	const { pid, started } = JSON.parse(readFileSync(file('host.json'), 'utf8')) as {
		pid: number;
		started?: string;
	};
	// Process IDs are reused, after a reboot at the latest: the process is only ours if it
	// also started when ours did. Never signal, or wait for, somebody else's.
	const ours = pid > 1 && startedAt(pid) === started;
	const running = () => ours && alive(pid);
	const signal = (name: NodeJS.Signals) => {
		try {
			if (running()) process.kill(-pid, name); // the whole group: the host, the CLI and what it started
		} catch {
			// already gone
		}
	};

	let finished = false;
	let offset = existsSync(file('offset')) ? Number(readFileSync(file('offset'), 'utf8')) : 0;
	let open = false;
	let background: BackgroundTask[] = [];
	let expecting = existsSync(file('expecting'));
	let resumeId = meta.options.resumeId;

	/** Keeps up with what an event means for where the session stands. */
	function note(event: HostEvent, replay = false) {
		if (event.kind === 'background') background = event.tasks;
		if (event.kind === 'resume') resumeId = event.id;
		if (event.kind === 'turn.started') {
			open = true;
			if (!replay) {
				expecting = false;
				rmSync(file('expecting'), { force: true });
			}
		}
		if (event.kind === 'turn.completed' || event.kind === 'turn.failed') open = false;
	}
	const parsed = (line: string) => JSON.parse(line) as HostEvent;
	// where things stood when we were last here
	for (const { line, end } of linesFrom(file('out.jsonl'), 0)) {
		if (end > offset) break;
		note(parsed(line), true);
	}

	/** Passes on every event written since last time, and remembers how far we got. */
	function read() {
		for (const { line, end } of linesFrom(file('out.jsonl'), offset)) {
			const event = parsed(line);
			if (emit(event, meta.generation + '/' + end) === false) return false;
			note(event);
			// After the event, so a restart in between repeats one rather than losing it.
			// Renamed into place: a half-written offset would replay the whole session.
			offset = end;
			writeFileSync(file('offset.tmp'), String(offset));
			renameSync(file('offset.tmp'), file('offset'));
		}
		return true;
	}

	const received = new Set(
		[...linesFrom(file('in.jsonl'), 0)].flatMap(({ line }) => {
			const command = JSON.parse(line) as Command;
			return command.type === 'message' && command.deliveryId ? [command.deliveryId] : [];
		})
	);
	function tell(command: Command) {
		if (finished) return false; // nobody left to tell
		if (command.type === 'message' && command.deliveryId && received.has(command.deliveryId))
			return false;
		appendFileSync(file('in.jsonl'), JSON.stringify(command) + '\n', { mode: 0o600 });
		if (command.type === 'message' && command.deliveryId) received.add(command.deliveryId);
		return true;
	}

	/** What was said too late to reach the CLI: the next session's to hear. */
	function unheard(): Said[] {
		if (!existsSync(file('exit'))) return [];
		const { consumed } = JSON.parse(readFileSync(file('exit'), 'utf8')) as Exit;
		return [...linesFrom(file('in.jsonl'), consumed)]
			.map(({ line }) => JSON.parse(line) as Command)
			.flatMap(({ type, ...said }) => (type === 'message' ? [said as Said] : []));
	}

	const { promise: done, resolve } = Promise.withResolvers<Said[]>();
	const timer = setInterval(poll, POLL_MS);
	function finish(left: Said[] = []) {
		if (finished) return;
		finished = true;
		clearInterval(timer);
		resolve(left);
	}

	function poll() {
		if (finished || !ready()) return;
		try {
			if (!read()) return;
			if (!existsSync(file('exit')) && running()) return;
			if (!read()) return; // whatever it wrote last
			const left = unheard();
			// A host ends every turn it began. One that went without a word did not.
			if (open || (expecting && left.length === 0)) {
				const said = ['err.log', 'host.log']
					.filter((name) => existsSync(file(name)))
					.map((name) => readFileSync(file(name), 'utf8').trim())
					.join(' ')
					.trim()
					.slice(-2000);
				const reason = `${meta.agent} ended unexpectedly`;
				const failure: AgentEvent = {
					kind: 'turn.failed',
					error: existsSync(file('stopped')) ? 'Stopped' : said ? `${reason}: ${said}` : reason
				};
				// With the host gone, wait for the same durable receipt.
				if (emit(failure, meta.generation + '/exit') === false) return;
			}
			finish(left);
			rmSync(dir, { recursive: true, force: true });
		} catch (error) {
			// a full disk, say: try again rather than take the daemon down
			console.error(`[session] could not follow ${dir}:`, error);
		}
	}

	return {
		...meta,
		read: poll,
		say(said) {
			if (!tell({ type: 'message', ...said }) || open || expecting) return;
			expecting = true;
			writeFileSync(file('expecting'), '');
		},
		stop: () => tell({ type: 'interrupt' }),
		close: () => tell({ type: 'close' }),
		answer: (id, answers) => tell({ type: 'answer', id, answers }),
		kill() {
			if (finished) return;
			writeFileSync(file('stopped'), '');
			signal('SIGTERM');
			// what won't end is ended
			setTimeout(() => !finished && signal('SIGKILL'), KILL_AFTER_MS).unref();
		},
		detach: () => finish(),
		background: () => background,
		working: () => open || expecting,
		over: () => finished,
		resumeId: () => resumeId,
		done
	};
}

/**
 * Starts an agent's session in `dir`, with the first thing said to it: processes of their
 * own that outlive this daemon, which it follows.
 */
export function startSession(
	meta: Meta,
	first: Said,
	emit: Deliver,
	dir: string,
	/** Whether there is somebody to report to right now; see `follow`. */
	ready: () => boolean = () => true,
	wrapperEntry?: string
): Session {
	rmSync(dir, { recursive: true, force: true });
	// Private to this user: it holds everything the agent read and said, and its API token.
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	chmodSync(dir, 0o700);
	const file = (name: string) => join(dir, name);
	writeFileSync(file('meta.json'), JSON.stringify({ ...meta, generation: randomUUID() }), {
		mode: 0o600
	});
	writeFileSync(file('in.jsonl'), JSON.stringify({ type: 'message', ...first }) + '\n', {
		mode: 0o600
	});
	writeFileSync(file('expecting'), '');
	writeFileSync(file('out.jsonl'), '', { mode: 0o600 });

	const log = openSync(file('host.log'), 'a', 0o600);
	let child;
	try {
		child = spawn(process.execPath, [HOST, dir, ...(wrapperEntry ? [wrapperEntry] : [])], {
			detached: true, // its own process group, which no signal meant for us reaches
			stdio: ['ignore', log, log],
			// inside the app we are Electron, which has to be told to be Node
			env: { ...process.env, ...(process.versions.electron && { ELECTRON_RUN_AS_NODE: '1' }) }
		});
	} finally {
		closeSync(log);
	}
	child.on('error', () => {}); // reported right below, or by whoever follows the session
	const { pid } = child;
	if (pid === undefined) {
		rmSync(dir, { recursive: true, force: true });
		throw new Error(`Failed to start ${meta.agent}`);
	}
	child.unref();
	writeFileSync(file('host.json'), JSON.stringify({ pid, started: startedAt(pid) ?? undefined }));
	return follow(dir, emit, ready);
}

/**
 * Picks up the sessions a previous daemon left running (or that ended while no daemon was
 * there to see it). `sessionsDir` holds one directory per workspace.
 */
export function resumeSessions(
	sessionsDir: string,
	emitFor: (workspaceId: string) => Deliver,
	ready: () => boolean = () => true
): Map<string, Session> {
	const sessions = new Map<string, Session>();
	if (!existsSync(sessionsDir)) return sessions;
	// Session directories name processes to signal and hold output we pass on as the agent's:
	// only trust a directory that nobody else could have written to.
	const { uid, mode } = statSync(sessionsDir);
	if (uid !== process.getuid?.() || mode & 0o022)
		throw new Error(`${sessionsDir} must belong to you and not be writable by others`);

	for (const workspaceId of readdirSync(sessionsDir)) {
		const dir = join(sessionsDir, workspaceId);
		try {
			sessions.set(workspaceId, follow(dir, emitFor(workspaceId), ready));
		} catch {
			rmSync(dir, { recursive: true, force: true }); // not a session we can make sense of
		}
	}
	return sessions;
}

/**
 * Ends the turns that a daemon from before sessions (ADR-010) left running in `turnsDir`,
 * one CLI per turn: nobody follows them any more, and no agent may work on unseen.
 */
export function endLegacyTurns(turnsDir: string) {
	if (!existsSync(turnsDir)) return;
	// It names processes to signal: only one that nobody else could have written to is trusted.
	const { uid, mode } = statSync(turnsDir);
	if (uid !== process.getuid?.() || mode & 0o022) return;
	for (const name of readdirSync(turnsDir)) {
		try {
			const meta = JSON.parse(readFileSync(join(turnsDir, name, 'meta.json'), 'utf8'));
			const { pid, started } = meta as { pid: number; started?: string };
			if (pid > 1 && startedAt(pid) === started) process.kill(-pid, 'SIGTERM');
		} catch {
			// nothing there to end
		}
	}
	rmSync(turnsDir, { recursive: true, force: true });
}
