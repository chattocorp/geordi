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
import { linesFrom } from './journal.ts';
import { spawn } from 'node:child_process';
import {
	appendFileSync,
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	renameSync,
	writeFileSync
} from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import type { Agent, AgentEvent, MessageImage } from '@geordi/protocol';
import { connectAgent } from './agents/acp.ts';
import { API_SERVER, API_TOKEN_ENV, type SessionOptions } from './agents/adapter.ts';

export type Meta = {
	agent: Agent;
	options: SessionOptions;
	/** For Geordi's agent API; only passed on if `options.api` is set. */
	apiToken?: string;
};

/** What a daemon tells a session. */
export type Command =
	/** Something to say to the agent: it starts a turn, or steers the one under way. */
	| { type: 'message'; deliveryId?: string; prompt: string; images?: MessageImage[] }
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
const cmd = agent === 'codex' ? 'codex-acp' : 'claude-agent-acp';
const resolve = createRequire(import.meta.url).resolve;
// The optional argument lets the session tests exercise this same host with a fixture.
const entry =
	process.argv[3] ??
	join(dirname(resolve('@agentclientprotocol/' + cmd + '/package.json')), 'dist/index.js');

// A signal meant to end the session reaches the whole process group, the CLI with it. We
// stay, to note how it ended.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => {});

const env = { ...process.env, ...options.env };
// The agent's own program is the one the person has installed: the wrappers would otherwise
// look for a copy of their own, which Geordi leaves out (some 300 MB each).
const program = agent === 'codex' ? 'codex' : 'claude';
const programEnv = agent === 'codex' ? 'CODEX_PATH' : 'CLAUDE_CODE_EXECUTABLE';
env[programEnv] ||= installed(program);
const missing = env[programEnv]
	? undefined
	: `Geordi could not find \`${program}\`. Install it, or put it on your PATH.`;
if (agent === 'codex') {
	const config = JSON.parse(env.CODEX_CONFIG || '{}');
	config.features = { ...config.features, default_mode_request_user_input: true };
	if (options.api && apiToken) {
		// Scope MCP tool approval to the server and workspace credential we inject.
		env[API_TOKEN_ENV] = apiToken;
		config.mcp_servers = {
			...config.mcp_servers,
			[API_SERVER]: {
				url: options.api.url,
				bearer_token_env_var: API_TOKEN_ENV,
				default_tools_approval_mode: 'approve'
			}
		};
	}
	env.CODEX_CONFIG = JSON.stringify(config);
}
/** Where a program is on the `PATH`, if it is anywhere. */
function installed(name: string): string | undefined {
	const extensions = process.platform === 'win32' ? (env.PATHEXT || '.EXE').split(';') : [''];
	for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean))
		for (const extension of extensions)
			if (existsSync(join(dir, name + extension))) return join(dir, name + extension);
}

const err = openSync(file('err.log'), 'a', 0o600);
const child = spawn(process.execPath, [entry], {
	cwd: options.cwd,
	env,
	stdio: ['pipe', 'pipe', err]
});
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

const dialogue = connectAgent(agent, options, apiToken, stdin, stdout, emit);
const ready = dialogue.initialize();
function failed(error: unknown) {
	emit({ kind: 'turn.failed', error: error instanceof Error ? error.message : String(error) });
	end();
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
			if (command.deliveryId) emit({ kind: 'message.received', id: command.deliveryId });
			emit({ kind: 'turn.started' }); // told now, rather than when the CLI gets round to it
			if (missing) return failed(missing);
			void ready.then(() => dialogue.message(command.prompt, command.images ?? [])).catch(failed);
			return;
		case 'interrupt':
			if (!open || stopping) return;
			stopping = true;
			void ready.then(() => dialogue.interrupt()).catch(failed);
			unstoppable = setTimeout(kill, KILL_AFTER_MS);
			return;
		case 'answer':
			return dialogue.answer(command.id, command.answers);
		case 'close':
			return end();
	}
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
	if (ending) return;
	for (const { line, end } of linesFrom(file('in.jsonl'), consumed)) {
		consumed = end;
		safely('could not do as told', () => obey(JSON.parse(line)));
		if (ending) break; // commands after close belong to the next session
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

child.on('error', () => over(127, `Failed to start ${cmd}`));
// `close`, not `exit`: only then has everything it wrote been read
child.on('close', (code) => over(code));

void ready.catch(failed);
input();
setInterval(input, POLL_MS);
