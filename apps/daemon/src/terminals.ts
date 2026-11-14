import { spawn, type IPty } from '@lydell/node-pty';
import type { DaemonResults, TerminalSize } from '@geordi/protocol';

/** How much output (in characters) is kept for viewers that connect later. */
const SCROLLBACK = 200_000;

type Terminal = {
	pty: IPty;
	write(data: string): void;
	scrollback: string;
	/** How many characters the shell has put out so far. */
	end: number;
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
 */
export function openTerminal(
	id: string,
	cwd: string,
	{ cols, rows }: TerminalSize,
	guard: () => void,
	onOutput: (data: string, offset: number) => void,
	onExit: () => void
) {
	const running = terminals.get(id);
	if (running) return running.pty.resize(cols, rows);

	const pty = spawn(process.env.SHELL || '/bin/sh', [], {
		name: 'xterm-256color',
		cwd,
		cols,
		rows,
		env: process.env as Record<string, string>
	});

	const output = (data: string) => {
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
		// a restarted shell may already have taken this one's place
		if (terminals.get(id) === terminal) terminals.delete(id);
		onExit();
	});
}

export const writeTerminal = (id: string, data: string) => terminals.get(id)?.write(data);

export const resizeTerminal = (id: string, { cols, rows }: TerminalSize) =>
	terminals.get(id)?.pty.resize(cols, rows);

export const closeTerminal = (id: string) => terminals.get(id)?.pty.kill();

export const runningTerminals = () => [...terminals.keys()];

export function scrollbackOf(id: string): DaemonResults['scrollback'] {
	const terminal = terminals.get(id);
	return terminal ? { data: terminal.scrollback, end: terminal.end } : null;
}

export function closeTerminals() {
	for (const { pty } of terminals.values()) pty.kill();
	terminals.clear();
}
