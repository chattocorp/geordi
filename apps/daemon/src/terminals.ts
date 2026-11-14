import { spawn, type IPty } from '@lydell/node-pty';
import type { TerminalSize } from '@geordi/protocol';

type Terminal = { pty: IPty; write(data: string): void };

/** Running shells, by terminal ID. */
const terminals = new Map<string, Terminal>();

/**
 * Starts a shell in `cwd`; if this terminal is already running, only resizes it.
 *
 * `guard` runs before every piece of input and throws if the directory can no longer be
 * trusted. The shell is the user's own, unsandboxed: a key press typically makes it run git
 * (for the prompt), so it must not get that far in a worktree an agent has tampered with.
 */
export function openTerminal(
	id: string,
	cwd: string,
	{ cols, rows }: TerminalSize,
	guard: () => void,
	onOutput: (data: string) => void,
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
	const terminal: Terminal = {
		pty,
		write(data) {
			try {
				guard();
			} catch (error) {
				onOutput(`\r\n${error instanceof Error ? error.message : error}\r\n`);
				return pty.kill();
			}
			pty.write(data);
		}
	};
	terminals.set(id, terminal);
	pty.onData(onOutput);
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

export function closeTerminals() {
	for (const { pty } of terminals.values()) pty.kill();
	terminals.clear();
}
