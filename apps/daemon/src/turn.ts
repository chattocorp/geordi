import { execFileSync, spawn } from 'node:child_process';
import {
	chmodSync,
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import type { Agent, AgentEvent } from '@geordi/protocol';
import { API_TOKEN_ENV, type AgentAdapter, type TurnOptions } from './agents/adapter.ts';

/**
 * Agent turns run detached from the daemon (ADR-007): the agent's process writes its output
 * to a file in the turn's directory, and the daemon follows that file. A daemon that
 * restarts finds the turns still running and carries on where it left off, so restarting
 * it (or it crashing) costs no work.
 *
 * A turn's directory holds:
 * - `meta.json`: which agent, and the process to signal (and when it started, to know it again)
 * - `out.jsonl`, `err.log`: what the agent's CLI writes
 * - `offset`: how much of `out.jsonl` has been passed on
 * - `exit`: the CLI's exit code, once it has ended
 * - `stopped`: present if the turn was stopped on purpose
 */

export type Turn = {
	/** Ends the agent's process. The turn then fails as "Stopped". */
	stop(): void;
	/** Stops following the turn without ending it, as a daemon going away does. */
	detach(): void;
	done: Promise<void>;
};

type Meta = { agent: Agent; turn?: number; cmd: string; pid: number; started?: string };

/** How often a turn's files are looked at. */
const POLL_MS = 100;
/** How long a stopped agent gets to end by itself before it is killed. */
const KILL_AFTER_MS = 10_000;

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
 * Follows a running turn: maps what the CLI has written since `offset` to agent events, and
 * guarantees exactly one terminal event (`turn.completed` or `turn.failed`), sent when the
 * process has exited.
 *
 * A turn is over when the process is, not when the CLI first says so. A resumed Claude
 * session, for one, first deals with anything left over from before (a background task
 * that finished) and reports that as done, and only then turns to the new message. What
 * the CLI says about how things ended is kept, and the last word counts.
 *
 * Nothing is read while `ready()` says there is nobody to tell: the files are the queue,
 * and an event only counts as passed on (`offset`) once it could be sent. So a daemon that
 * goes away while the forge is away too loses nothing either.
 */
function follow(
	dir: string,
	adapter: AgentAdapter,
	emit: (event: AgentEvent) => void,
	ready: () => boolean
): Turn {
	const { cmd, pid, started } = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta;
	const file = (name: string) => join(dir, name);
	// Process IDs are reused, after a reboot at the latest: the process is only ours if it
	// also started when ours did. Never signal, or wait for, somebody else's.
	const ours = pid > 1 && startedAt(pid) === started;
	const running = () => ours && alive(pid);
	const signal = (name: NodeJS.Signals) => {
		try {
			if (running()) process.kill(-pid, name); // the whole group: the CLI and what it started
		} catch {
			// already gone
		}
	};
	const out = openSync(file('out.jsonl'), 'r');

	let offset = existsSync(file('offset')) ? Number(readFileSync(file('offset'), 'utf8')) : 0;
	/** How the CLI last said the turn ended, if it has. */
	let outcome: AgentEvent | undefined;
	let partial = Buffer.alloc(0);
	let timer: NodeJS.Timeout;
	let finish = () => {};

	/** Passes on every complete line written since last time, and remembers how far we got. */
	function read() {
		const chunk = Buffer.alloc(64 * 1024);
		for (let n; (n = readSync(out, chunk, 0, chunk.length, offset + partial.length)) > 0;) {
			partial = Buffer.concat([partial, chunk.subarray(0, n)]);
			for (let end; (end = partial.indexOf(10)) >= 0;) {
				const line = partial.subarray(0, end).toString('utf8');
				partial = partial.subarray(end + 1);
				offset += end + 1;
				let parsed: unknown;
				try {
					parsed = JSON.parse(line);
				} catch {
					continue; // not JSON; CLIs occasionally print plain text
				}
				let events: AgentEvent[] = [];
				try {
					events = adapter.parse(parsed);
				} catch (error) {
					// a line the adapter can't make sense of costs that line, not the daemon
					console.error(`[turn] ${cmd} wrote something unexpected:`, error);
				}
				for (const event of events) {
					if (event.kind === 'turn.completed' || event.kind === 'turn.failed') outcome = event;
					else emit(event);
				}
			}
			// After the events, so a restart in between repeats a line rather than losing it.
			// Renamed into place: a half-written offset would replay the whole turn.
			writeFileSync(file('offset.tmp'), String(offset));
			renameSync(file('offset.tmp'), file('offset'));
		}
	}

	function ended(): AgentEvent | null {
		const exited = existsSync(file('exit'));
		if (!exited && running()) return null;
		read(); // whatever it wrote last

		if (existsSync(file('stopped'))) return { kind: 'turn.failed', error: 'Stopped' };
		if (outcome) return outcome;
		const code = exited ? readFileSync(file('exit'), 'utf8').trim() : null;
		const stderr = readFileSync(file('err.log'), 'utf8').trim().slice(-2000);
		const reason =
			code === '127'
				? `Failed to start ${cmd}`
				: code
					? `${cmd} exited with code ${code}`
					: `${cmd} ended unexpectedly`;
		return { kind: 'turn.failed', error: stderr ? `${reason}: ${stderr}` : reason };
	}

	let finished = false;
	const done = new Promise<void>((resolve) => {
		finish = () => {
			if (finished) return;
			finished = true;
			clearInterval(timer);
			closeSync(out);
			resolve();
		};
		timer = setInterval(() => {
			if (!ready()) return;
			try {
				read();
				const end = ended();
				if (!end) return;
				emit(end);
			} catch (error) {
				// a full disk, say: try again rather than take the daemon down
				console.error(`[turn] could not follow ${dir}:`, error);
				return;
			}
			finish();
			rmSync(dir, { recursive: true, force: true });
		}, POLL_MS);
	});

	return {
		stop() {
			writeFileSync(file('stopped'), '');
			signal('SIGTERM');
			// an agent that won't end is ended
			setTimeout(() => !finished && signal('SIGKILL'), KILL_AFTER_MS).unref();
		},
		detach: () => finish(),
		done
	};
}

/**
 * Starts one agent turn in `dir`, as a process of its own that outlives this daemon, and
 * follows it.
 */
export function runTurn(
	adapter: AgentAdapter,
	/** Which agent, and which of the workspace's turns this is. */
	{ agent, turn }: { agent: Agent; turn?: number },
	options: TurnOptions,
	emit: (event: AgentEvent) => void,
	dir: string,
	/** For Geordi's agent API; only passed on if `options.api` is set. */
	apiToken?: string,
	/** Whether there is somebody to report to right now; see `follow`. */
	ready: () => boolean = () => true
): Turn {
	const { cmd, args } = adapter.command(options);
	rmSync(dir, { recursive: true, force: true });
	// Private to this user: the output holds everything the agent read and said.
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	chmodSync(dir, 0o700);

	const out = openSync(join(dir, 'out.jsonl'), 'a', 0o600);
	const err = openSync(join(dir, 'err.log'), 'a', 0o600);
	// A shell runs the CLI and notes how it ended, since we may not be around to see it. It
	// sits out a SIGTERM (which the CLI, in the same group, gets too), so that the turn is
	// over when the CLI is, not when the shell is.
	const script =
		'trap : TERM; "$@"; echo $? > "$GEORDI_TURN_DIR/exit.tmp"; mv "$GEORDI_TURN_DIR/exit.tmp" "$GEORDI_TURN_DIR/exit"';
	let child;
	try {
		child = spawn('/bin/sh', ['-c', script, 'sh', cmd, ...args], {
			cwd: options.cwd,
			detached: true, // its own process group, which no signal meant for us reaches
			stdio: ['ignore', out, err],
			env: {
				...process.env,
				GEORDI_TURN_DIR: dir,
				...(options.api && apiToken && { [API_TOKEN_ENV]: apiToken })
			}
		});
	} finally {
		closeSync(out);
		closeSync(err);
	}
	child.on('error', () => {}); // reported right below, or by whoever follows the turn
	const { pid } = child;
	if (pid === undefined) {
		rmSync(dir, { recursive: true, force: true });
		throw new Error(`Failed to start ${cmd}`);
	}
	child.unref();

	const meta: Meta = { agent, turn, cmd, pid, started: startedAt(pid) ?? undefined };
	writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
	return follow(dir, adapter, emit, ready);
}

/**
 * Picks up the turns a previous daemon left running (or that ended while no daemon was
 * there to see it). `turnsDir` holds one directory per workspace.
 */
export async function resumeTurns(
	turnsDir: string,
	adapterFor: (agent: Agent) => Promise<AgentAdapter>,
	emitFor: (workspaceId: string, turn?: number) => (event: AgentEvent) => void,
	ready: () => boolean = () => true
): Promise<Map<string, Turn>> {
	const turns = new Map<string, Turn>();
	if (!existsSync(turnsDir)) return turns;
	// Turn directories name processes to signal and hold output we pass on as the agent's:
	// only trust a directory that nobody else could have written to.
	const { uid, mode } = statSync(turnsDir);
	if (uid !== process.getuid?.() || mode & 0o022)
		throw new Error(`${turnsDir} must belong to you and not be writable by others`);

	for (const workspaceId of readdirSync(turnsDir)) {
		const dir = join(turnsDir, workspaceId);
		try {
			const { agent, turn } = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta;
			turns.set(
				workspaceId,
				follow(dir, await adapterFor(agent), emitFor(workspaceId, turn), ready)
			);
		} catch {
			rmSync(dir, { recursive: true, force: true }); // not a turn we can make sense of
		}
	}
	return turns;
}
