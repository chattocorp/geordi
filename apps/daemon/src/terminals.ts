import { spawn, type IPty } from '@lydell/node-pty';
import type { TerminalSize } from '@geordi/protocol';

/** One interactive shell per workspace, by workspace ID. */
const terminals = new Map<string, IPty>();

/** Starts the workspace's shell in `cwd`; if it is already running, only resizes it. */
export function openTerminal(
	workspaceId: string,
	cwd: string,
	{ cols, rows }: TerminalSize,
	onOutput: (data: string) => void,
	onExit: () => void
) {
	const running = terminals.get(workspaceId);
	if (running) return running.resize(cols, rows);

	const pty = spawn(process.env.SHELL || '/bin/sh', [], {
		name: 'xterm-256color',
		cwd,
		cols,
		rows,
		env: process.env as Record<string, string>
	});
	terminals.set(workspaceId, pty);
	pty.onData(onOutput);
	pty.onExit(() => {
		// a restarted shell may already have taken this one's place
		if (terminals.get(workspaceId) === pty) terminals.delete(workspaceId);
		onExit();
	});
}

export const writeTerminal = (workspaceId: string, data: string) =>
	terminals.get(workspaceId)?.write(data);

export const resizeTerminal = (workspaceId: string, { cols, rows }: TerminalSize) =>
	terminals.get(workspaceId)?.resize(cols, rows);

export function closeTerminals() {
	for (const pty of terminals.values()) pty.kill();
	terminals.clear();
}
