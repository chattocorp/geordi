import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { spawn, type IPty } from '@lydell/node-pty';
import type { DaemonResults, TerminalSize } from '@geordi/protocol';

/** How much output (in characters) is kept for viewers that connect later. */
const SCROLLBACK = 200_000;

/**
 * What a command's terminal puts out when the command has ended, with its status: an escape
 * sequence of our own, which terminals ignore. The command could print it too; all it would
 * get by that is having its end noticed early.
 */
// eslint-disable-next-line no-control-regex -- an escape sequence is what it is
const ENDED = /\x1b\]7717;(\d+)\x07/;

type Terminal = {
	pty: IPty;
	/** Interactive shell executable, or null for a configured command. */
	shell: string | null;
	write(data: string): void;
	scrollback: string;
	/** How many characters the shell has put out so far. */
	end: number;
	/** The status the command it was opened to run ended with, once it has. */
	ended?: number;
};

/**
 * Running shells, by terminal ID. They and their scrollback live here, not in the forge:
 * the forge only shows them, and can come and go without disturbing them.
 */
const terminals = new Map<string, Terminal>();

/**
 * Starts a shell in `cwd`; if this terminal is already running, only resizes it.
 *
 * `guard` runs before every piece of input and throws if the directory can no longer be
 * trusted. The shell is the user's own, unsandboxed: a key press typically makes it run git
 * (for the prompt), so it must not get that far in a worktree an agent has tampered with.
 *
 * `onOutput` gets each piece of output with its position in the shell's whole output.
 *
 * With `command`, the terminal runs that instead of a shell for typing into: in the user's
 * shell, as if typed there (so that it finds what their shell would). When the command
 * ends, the terminal waits for Enter unless closeOnSuccess is set and the command succeeded.
 * `onEnded` hears of that moment, with the command's status (`null`: the terminal was
 * closed first).
 */
export function openTerminal(
	id: string,
	cwd: string,
	{
		cols,
		rows,
		initialCommand,
		command,
		closeOnSuccess = false,
		env = {},
		onEnded
	}: TerminalSize & {
		initialCommand?: string;
		command?: string;
		closeOnSuccess?: boolean;
		/** On top of our own environment. */ env?: Record<string, string>;
		onEnded?: (status: number | null) => void;
	},
	guard: () => void,
	onOutput: (data: string, offset: number) => void,
	onExit: () => void
) {
	const running = terminals.get(id);
	// one whose command has ended makes way for a new one: that is how a job is started again
	if (running && running.ended === undefined) return running.pty.resize(cols, rows);
	if (running) {
		terminals.delete(id);
		running.pty.kill();
	}

	// A block tagged sh uses sh syntax even when the person's login shell is fish.
	const shell = initialCommand === undefined ? process.env.SHELL || '/bin/sh' : '/bin/sh';
	// The command and the shell reach the script as arguments: nothing in them is parsed twice.
	// `printf` makes the escapes into a new line and dim text. Once the command has ended,
	// the script only waits, without reading: the user's shell may have handed the terminal
	// to the command (job control) and not back, and then a read would fail at once. Enter is
	// heard here instead (`write`).
	const script = `
		"$0" -l -i -c "$1"
		s=$?
		printf "\\033]7717;%s\\007" "$s"
		if [ "$2" = close ] && [ "$s" -eq 0 ]; then exit 0; fi
		printf "\\n\\033[2m[ended with status %s; press Enter to close]\\033[0m" "$s"
		exec sleep 2147483647
	`;
	const [file, args] = command
		? ['/bin/sh', ['-c', script, shell, command, closeOnSuccess ? 'close' : 'wait']]
		: [shell, []];
	// POSIX sh reads ENV before its first interactive prompt. The file keeps the
	// block out of the line editor (tabs, here-documents) and out of argv's size limit.
	let startup: string | undefined;
	if (initialCommand !== undefined) {
		guard();
		startup = join(tmpdir(), `geordi-shell-${randomUUID()}`);
		// Once opened, the shell can unlink it. A nested shell must not run it again.
		writeFileSync(startup, 'command -p rm -f "$ENV"\nunset ENV\n' + initialCommand, {
			flag: 'wx',
			mode: 0o600
		});
	}
	let pty: IPty;
	try {
		pty = spawn(file, args, {
			name: 'xterm-256color',
			cwd,
			cols,
			rows,
			env: { ...(process.env as Record<string, string>), ...env, ...(startup && { ENV: startup }) }
		});
	} catch (error) {
		if (startup) rmSync(startup, { force: true });
		throw error;
	}

	/** Calls `onEnded` once. */
	let ended = onEnded;
	const end = (status: number | null) => {
		ended?.(status);
		ended = undefined;
	};
	/** The end of the output so far: where the start of a sequence split across pieces is. */
	let tail = '';

	/** Whether there is a command whose end is still to come. */
	let awaited = !!command;

	const output = (data: string) => {
		if (awaited) {
			const found = ENDED.exec(tail + data);
			if (found) {
				awaited = false;
				terminal.ended = Number(found[1]);
				end(terminal.ended);
			}
			tail = data.slice(-16);
		}
		const offset = terminal.end;
		terminal.end += data.length;
		terminal.scrollback = (terminal.scrollback + data).slice(-SCROLLBACK);
		onOutput(data, offset);
	};

	const terminal: Terminal = {
		pty,
		shell: command ? null : basename(shell),
		scrollback: '',
		end: 0,
		write(data) {
			try {
				guard();
			} catch (error) {
				output(`\r\n${error instanceof Error ? error.message : error}\r\n`);
				return pty.kill();
			}
			// over, and waiting for Enter to close
			if (terminal.ended !== undefined) return void (/[\r\n]/.test(data) && pty.kill());
			pty.write(data);
		}
	};
	terminals.set(id, terminal);
	pty.onData(output);
	pty.onExit(() => {
		// The shell may have been killed before it read its startup file.
		if (startup) rmSync(startup, { force: true });
		// a restarted shell may already have taken this one's place: then it is not this
		// terminal that has gone, and nobody is told that it has
		const current = terminals.get(id) === terminal;
		if (current) terminals.delete(id);
		end(null);
		if (current) onExit();
	});
}

export const writeTerminal = (id: string, data: string) => terminals.get(id)?.write(data);

export const resizeTerminal = (id: string, { cols, rows }: TerminalSize) =>
	terminals.get(id)?.pty.resize(cols, rows);

export const closeTerminal = (id: string) => terminals.get(id)?.pty.kill();

export const runningTerminals = () => [...terminals.keys()];

/** The running terminals whose command has ended, with the status it ended with. */
export const endedTerminals = (): Record<string, number> =>
	Object.fromEntries(
		[...terminals].flatMap(([id, { ended }]) => (ended === undefined ? [] : [[id, ended]]))
	);

const exec = promisify(execFile);

/** A terminal at its shell prompt can close quietly. Inspect processes only on archive. */
export async function hasTerminalActivity(workspaceId: string): Promise<boolean> {
	const shells = new Map<number, string>();
	for (const [id, terminal] of terminals) {
		if (!id.startsWith(workspaceId + ':') || terminal.ended !== undefined) continue;
		if (terminal.shell === null) return true;
		shells.set(terminal.pty.pid, terminal.shell);
	}
	if (!shells.size) return false;

	// A foreground or background job has a parent in the shell. An exec'd program
	// replaces the shell itself and keeps its PID.
	const { stdout } = await exec('/bin/ps', ['-A', '-o', 'pid=,ppid=,stat=,comm=']);
	for (const line of stdout.split('\n')) {
		const row = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
		// A shell may leave a finished background job in the process table until it waits.
		if (!row || row[3].startsWith('Z')) continue;
		if (shells.has(Number(row[2]))) return true;
		const shell = shells.get(Number(row[1]));
		if (shell && basename(row[4]) !== shell) return true;
	}
	return false;
}

export function scrollbackOf(id: string): DaemonResults['scrollback'] {
	const terminal = terminals.get(id);
	return terminal ? { data: terminal.scrollback, end: terminal.end } : null;
}

export function closeTerminals() {
	for (const { pty } of terminals.values()) pty.kill();
	terminals.clear();
}
