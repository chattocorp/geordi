/**
 * The host of one agent session (ADR-010): a small process of its own that runs the agent's
 * CLI and talks to it for as long as it runs, in the CLI's own protocol, over its standard
 * input and output. It needs no daemon: what it is to tell the CLI it reads from a file the
 * daemon appends to, and what the CLI does it writes to a file the daemon follows. So a
 * daemon can come and go (ADR-007) while the conversation, which needs both directions and
 * somebody who remembers where it stands, goes on.
 *
 * Started as `node host.ts <directory>`. The directory holds:
 * - `meta.json`: which agent, and what its CLI is started with (written by the daemon)
 * - `in.jsonl`: what to tell the CLI, one `Command` per line (appended to by the daemon)
 * - `out.jsonl`: what happened, one `AgentEvent` per line (written here)
 * - `err.log`: what the CLI wrote to its standard error
 * - `exit`: how it ended (`Exit`), once it has
 * - `stopped`: present if the session was ended on purpose
 *
 * The CLI is ended when it has had nothing to do for a while (it is started again, where it
 * left off, with the next message), but never while it has something running.
 */
import { spawn } from 'node:child_process';
import {
	appendFileSync,
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	readSync,
	renameSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import type { Agent, AgentEvent, MessageImage } from '@geordi/protocol';
import { API_TOKEN_ENV, adapterFor, type SessionOptions, type Step } from './agents/adapter.ts';

export type Meta = {
	agent: Agent;
	options: SessionOptions;
	/** For Geordi's agent API; only passed on if `options.api` is set. */
	apiToken?: string;
};

/** What a daemon tells a session. */
export type Command =
	/** Something to say to the agent: it starts a turn, or steers the one under way. */
	| { type: 'message'; prompt: string; images?: MessageImage[] }
	/** Stops the turn under way; the CLI goes on running. */
	| { type: 'interrupt' }
	| { type: 'answer'; id: string; answers: string[] }
	/** Ends the CLI now, whatever it is doing. */
	| { type: 'close' };

/** How a session ended: the CLI's exit code, and how much of `in.jsonl` (in bytes) reached it. */
export type Exit = { code: number | null; consumed: number };

/** How often the input file is looked at. */
const POLL_MS = 100;
/** How long a CLI gets to do as it was told (stop a turn, end) before it is made to. */
const KILL_AFTER_MS = 10_000;
/** How long a CLI with nothing to do is kept running. */
const IDLE_MS = Number(process.env.GEORDI_SESSION_IDLE_MS) || 5 * 60_000;

const dir = process.argv[2];
const file = (name: string) => join(dir, name);
const { agent, options, apiToken } = JSON.parse(readFileSync(file('meta.json'), 'utf8')) as Meta;
const adapter = await adapterFor(agent);
const dialogue = adapter.dialogue(options);
const { cmd, args } = adapter.command(options);

// A signal meant to end the session reaches the whole process group, the CLI with it. We
// stay, to note how it ended.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => {});

const env: NodeJS.ProcessEnv = {
	...process.env,
	...options.env,
	...(options.api && apiToken && { [API_TOKEN_ENV]: apiToken })
};
delete env.ELECTRON_RUN_AS_NODE; // ours, to run as Node inside the app: not for what an agent starts

const err = openSync(file('err.log'), 'a', 0o600);
const child = spawn(cmd, args, { cwd: options.cwd, env, stdio: ['pipe', 'pipe', err] });
closeSync(err);
// both are pipes, as asked for
const stdin = child.stdin as Writable;
const stdout = child.stdout as Readable;
stdin.on('error', () => {}); // a CLI that has gone: its exit says so

/** Whether a turn is under way. */
let open = false;
/** Whether the turn under way was asked to stop: however it ends then, it was stopped. */
let stopping = false;
/** Whether the CLI was told that nothing more is coming. Nothing is read for it after that. */
let ending = false;
/** How much of `in.jsonl` has been passed on. */
let consumed = 0;
let idle: NodeJS.Timeout | undefined;
let unstoppable: NodeJS.Timeout | undefined;

const stopped = () => stopping || existsSync(file('stopped'));

function emit(event: AgentEvent) {
	if (event.kind === 'turn.started') {
		if (open) return;
		open = true;
	} else if (event.kind === 'turn.completed' || event.kind === 'turn.failed') {
		if (!open) return;
		if (event.kind === 'turn.failed' && stopped())
			event = { kind: 'turn.failed', error: 'Stopped' };
		open = stopping = false;
		clearTimeout(unstoppable);
	}
	appendFileSync(file('out.jsonl'), JSON.stringify(event) + '\n', { mode: 0o600 });
}

function apply({ write = [], events = [] }: Step) {
	if (!ending) for (const line of write) stdin.write(line + '\n');
	events.forEach(emit);
}

/** Ends everything in our process group but ourselves: the CLI, and what it started. */
function kill() {
	try {
		process.kill(0, 'SIGTERM');
	} catch {
		// nobody left
	}
	setTimeout(() => child.kill('SIGKILL'), KILL_AFTER_MS).unref();
}

/** Tells the CLI that nothing more is coming, which ends it. */
function end() {
	if (ending) return;
	ending = true;
	stdin.end();
	setTimeout(kill, KILL_AFTER_MS).unref();
}

function obey(command: Command) {
	switch (command.type) {
		case 'message':
			emit({ kind: 'turn.started' }); // told now, rather than when the CLI gets round to it
			return apply(dialogue.message(command.prompt, command.images ?? []));
		case 'interrupt':
			if (!open || stopping) return;
			stopping = true;
			apply(dialogue.interrupt());
			unstoppable = setTimeout(kill, KILL_AFTER_MS);
			return;
		case 'answer':
			return apply(dialogue.answer(command.id, command.answers));
		case 'close':
			return end();
	}
}

/** Splits what arrives in pieces into the lines it is made of. */
function lines(each: (line: string) => void) {
	let partial = Buffer.alloc(0);
	return (chunk: Buffer) => {
		partial = Buffer.concat([partial, chunk]);
		for (let at; (at = partial.indexOf(10)) >= 0;) {
			const line = partial.subarray(0, at);
			partial = partial.subarray(at + 1);
			each(line.toString('utf8'));
		}
	};
}

/** Whatever goes wrong with one line costs that line, never the session. */
function safely(what: string, run: () => void) {
	try {
		run();
	} catch (error) {
		console.error(`[host] ${what}:`, error);
	}
}

/** Passes on what the daemon has written since last time. */
function input() {
	if (ending || !existsSync(file('in.jsonl'))) return;
	const from = openSync(file('in.jsonl'), 'r');
	try {
		const take = lines((line) => {
			if (ending) return; // after a `close`: left for the next session
			consumed += Buffer.byteLength(line) + 1;
			safely('could not do as told', () => obey(JSON.parse(line)));
		});
		const chunk = Buffer.alloc(64 * 1024);
		let at = consumed;
		for (let n; !ending && (n = readSync(from, chunk, 0, chunk.length, at)) > 0; at += n)
			take(Buffer.from(chunk.subarray(0, n)));
	} finally {
		closeSync(from);
	}
	rest();
}

/** Ends a CLI that has had nothing to do for a while, and nothing running. */
function rest() {
	if (open || ending || dialogue.busy()) {
		clearTimeout(idle);
		idle = undefined;
		return;
	}
	idle ??= setTimeout(() => {
		idle = undefined;
		input(); // what was said in the meantime comes first
		if (!open && !dialogue.busy()) end();
	}, IDLE_MS);
}

function over(code: number | null, problem?: string) {
	const said = readFileSync(file('err.log'), 'utf8').trim().slice(-2000);
	const reason =
		problem ?? (code ? `${cmd} exited with code ${code}` : `${cmd} ended unexpectedly`);
	emit({ kind: 'turn.failed', error: said ? `${reason}: ${said}` : reason });
	const exit: Exit = { code, consumed };
	// Renamed into place: the daemon must never read half of it.
	writeFileSync(file('exit.tmp'), JSON.stringify(exit));
	renameSync(file('exit.tmp'), file('exit'));
	process.exit(0);
}

stdout.on(
	'data',
	lines((line) => {
		let read: unknown;
		try {
			read = JSON.parse(line);
		} catch {
			return; // not JSON; CLIs occasionally print plain text
		}
		safely(`${cmd} wrote something unexpected`, () => apply(dialogue.read(read)));
		rest();
	})
);
child.on('error', () => over(127, `Failed to start ${cmd}`));
// `close`, not `exit`: only then has everything it wrote been read
child.on('close', (code) => over(code));

apply({ write: dialogue.open?.() });
input();
setInterval(input, POLL_MS);
