import { spawn, type IPty } from '@lydell/node-pty';
import type { TerminalSize } from '@geordi/protocol';

type Terminal = { pty: IPty; write(data: string): void };

/** One interactive shell per workspace, by workspace ID. */
const terminals = new Map<string, Terminal>();

/**
 * Starts the workspace's shell in `cwd`; if it is already running, only resizes it.
 *
 * `guard` runs before every piece of input and throws if the directory can no longer be
 * trusted. The shell is the user's own, unsandboxed: a key press typically makes it run git
 * (for the prompt), so it must not get that far in a worktree an agent has tampered with.
 */
export function openTerminal(
	workspaceId: string,
	cwd: string,
	{ cols, rows }: TerminalSize,
	guard: () => void,
	onOutput: (data: string) => void,
	onExit: () => void
) {
	const running = terminals.get(workspaceId);
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
	terminals.set(workspaceId, terminal);
	pty.onData(onOutput);
	pty.onExit(() => {
		// a restarted shell may already have taken this one's place
		if (terminals.get(workspaceId) === terminal) terminals.delete(workspaceId);
		onExit();
	});
}

export const writeTerminal = (workspaceId: string, data: string) =>
	terminals.get(workspaceId)?.write(data);

export const resizeTerminal = (workspaceId: string, { cols, rows }: TerminalSize) =>
	terminals.get(workspaceId)?.pty.resize(cols, rows);

export function closeTerminals() {
	for (const { pty } of terminals.values()) pty.kill();
	terminals.clear();
}
