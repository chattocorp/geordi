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
 * ends, the terminal says how and waits for Enter, so that what it printed can be read.
 * `onEnded` hears of that moment, with the command's status (`null`: the terminal was
 * closed first).
 */
export function openTerminal(
	id: string,
	cwd: string,
	{
		cols,
		rows,
		command,
		env = {},
		onEnded
	}: TerminalSize & {
		command?: string;
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

	const shell = process.env.SHELL || '/bin/sh';
	// The command and the shell reach the script as arguments: nothing in them is parsed twice.
	// `printf` makes the escapes into a new line and dim text.
	const script =
		'"$0" -l -i -c "$1"; s=$?; printf "\\033]7717;%s\\007\\n\\033[2m[ended with status %s; press Enter to close]\\033[0m" "$s" "$s"; read -r _';
	const [file, args] = command ? ['/bin/sh', ['-c', script, shell, command]] : [shell, []];
	const pty = spawn(file, args, {
		name: 'xterm-256color',
		cwd,
		cols,
		rows,
		env: { ...(process.env as Record<string, string>), ...env }
	});

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
		scrollback: '',
		end: 0,
		write(data) {
			try {
				guard();
			} catch (error) {
				output(`\r\n${error instanceof Error ? error.message : error}\r\n`);
				return pty.kill();
			}
			pty.write(data);
		}
	};
	terminals.set(id, terminal);
	pty.onData(output);
	pty.onExit(() => {
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

export function scrollbackOf(id: string): DaemonResults['scrollback'] {
	const terminal = terminals.get(id);
	return terminal ? { data: terminal.scrollback, end: terminal.end } : null;
}

export function closeTerminals() {
	for (const { pty } of terminals.values()) pty.kill();
	terminals.clear();
}
