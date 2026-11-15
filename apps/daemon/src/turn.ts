import { spawn } from 'node:child_process';
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	rmSync,
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
 * - `meta.json`: which agent, and the process to signal
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

type Meta = { agent: Agent; cmd: string; pid: number };

/** How often a turn's files are looked at. */
const POLL_MS = 100;

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
 */
function follow(dir: string, adapter: AgentAdapter, emit: (event: AgentEvent) => void): Turn {
	const { cmd, pid } = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta;
	const file = (name: string) => join(dir, name);
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
				for (const event of adapter.parse(parsed)) {
					if (event.kind === 'turn.completed' || event.kind === 'turn.failed') outcome = event;
					else emit(event);
				}
			}
			// after the events, so a restart in between repeats a line rather than losing it
			writeFileSync(file('offset'), String(offset));
		}
	}

	function ended(): AgentEvent | null {
		const exited = existsSync(file('exit'));
		if (!exited && alive(pid)) return null;
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

	const done = new Promise<void>((resolve) => {
		finish = () => {
			clearInterval(timer);
			closeSync(out);
			resolve();
		};
		timer = setInterval(() => {
			read();
			const end = ended();
			if (!end) return;
			emit(end);
			finish();
			rmSync(dir, { recursive: true, force: true });
		}, POLL_MS);
	});

	return {
		stop() {
			writeFileSync(file('stopped'), '');
			try {
				process.kill(-pid, 'SIGTERM'); // the whole group: the CLI and what it started
			} catch {
				// already gone
			}
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
	agent: Agent,
	options: TurnOptions,
	emit: (event: AgentEvent) => void,
	dir: string,
	/** For Geordi's agent API; only passed on if `options.api` is set. */
	apiToken?: string
): Turn {
	const { cmd, args } = adapter.command(options);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });

	const out = openSync(join(dir, 'out.jsonl'), 'a');
	const err = openSync(join(dir, 'err.log'), 'a');
	// A shell runs the CLI and notes how it ended, since we may not be around to see it.
	const script =
		'"$@"; echo $? > "$GEORDI_TURN_DIR/exit.tmp"; mv "$GEORDI_TURN_DIR/exit.tmp" "$GEORDI_TURN_DIR/exit"';
	const child = spawn('/bin/sh', ['-c', script, 'sh', cmd, ...args], {
		cwd: options.cwd,
		detached: true, // its own process group, which no signal meant for us reaches
		stdio: ['ignore', out, err],
		env: {
			...process.env,
			GEORDI_TURN_DIR: dir,
			...(options.api && apiToken && { [API_TOKEN_ENV]: apiToken })
		}
	});
	child.unref();
	closeSync(out);
	closeSync(err);

	const meta: Meta = { agent, cmd, pid: child.pid ?? -1 };
	writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
	return follow(dir, adapter, emit);
}

/**
 * Picks up the turns a previous daemon left running (or that ended while no daemon was
 * there to see it). `turnsDir` holds one directory per workspace.
 */
export async function resumeTurns(
	turnsDir: string,
	adapterFor: (agent: Agent) => Promise<AgentAdapter>,
	emitFor: (workspaceId: string) => (event: AgentEvent) => void
): Promise<Map<string, Turn>> {
	const turns = new Map<string, Turn>();
	if (!existsSync(turnsDir)) return turns;

	for (const workspaceId of readdirSync(turnsDir)) {
		const dir = join(turnsDir, workspaceId);
		try {
			const { agent } = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta;
			turns.set(workspaceId, follow(dir, await adapterFor(agent), emitFor(workspaceId)));
		} catch {
			rmSync(dir, { recursive: true, force: true }); // not a turn we can make sense of
		}
	}
	return turns;
}
