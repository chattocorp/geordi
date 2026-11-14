import type { TerminalSize, WorkspaceRef } from '@geordi/protocol';
import type { Dispatch } from './workspaces.ts';

/** How much output (in characters) is kept for browsers that connect later. */
const SCROLLBACK = 200_000;

type Terminal = {
	scrollback: string;
	/** Whether a daemon is running this workspace's shell. */
	running: boolean;
	size: TerminalSize;
	listeners: Set<Listener>;
};

/** `replay` marks old output, sent to catch a new viewer up. */
type Listener = (data: string, replay: boolean) => void;

const notice = (text: string) => `\r\n\x1b[2m${text}\x1b[0m\r\n`;

/**
 * Relays each workspace's shell between browsers and the daemon running it. Terminal I/O
 * is deliberately not event-sourced (ADR-003): only recent output is kept, in memory.
 */
export function createTerminals(dispatch: Dispatch, ref: (workspaceId: string) => WorkspaceRef) {
	const terminals = new Map<string, Terminal>();

	function get(id: string): Terminal {
		let terminal = terminals.get(id);
		if (!terminal) {
			terminal = {
				scrollback: '',
				running: false,
				size: { cols: 80, rows: 24 },
				listeners: new Set()
			};
			terminals.set(id, terminal);
		}
		return terminal;
	}

	function emit(terminal: Terminal, data: string) {
		terminal.scrollback = (terminal.scrollback + data).slice(-SCROLLBACK);
		for (const listener of terminal.listeners) listener(data, false);
	}

	/** Asks a daemon to start the shell (or, if it is running, to resize it). */
	function open(id: string, terminal: Terminal) {
		terminal.running = dispatch({ type: 'terminal.open', ...ref(id), ...terminal.size });
		if (!terminal.running) emit(terminal, notice('No daemon connected. Press any key to retry.'));
	}

	function exit(terminal: Terminal) {
		if (!terminal.running) return;
		terminal.running = false;
		emit(terminal, notice('The shell exited. Press any key to start a new one.'));
	}

	return {
		/**
		 * Connects a viewer: starts the shell if needed, replays recent output to `listener`
		 * and keeps it updated. Returns a function that disconnects it.
		 */
		attach(id: string, size: TerminalSize, listener: Listener): () => void {
			const terminal = get(id);
			terminal.size = size;
			open(id, terminal);
			if (terminal.scrollback) listener(terminal.scrollback, true);
			terminal.listeners.add(listener);
			return () => terminal.listeners.delete(listener);
		},

		input(id: string, data: string) {
			const terminal = get(id);
			if (terminal.running) dispatch({ type: 'terminal.input', workspaceId: id, data });
			else open(id, terminal);
		},

		resize(id: string, size: TerminalSize) {
			const terminal = get(id);
			terminal.size = size;
			if (terminal.running) dispatch({ type: 'terminal.resize', workspaceId: id, ...size });
		},

		output(id: string, data: string) {
			const terminal = terminals.get(id);
			if (terminal) emit(terminal, data);
		},

		exit(id: string) {
			const terminal = terminals.get(id);
			if (terminal) exit(terminal);
		},

		/** A daemon (re)connected. Daemons end their shells when the connection drops. */
		reset() {
			for (const terminal of terminals.values()) exit(terminal);
		}
	};
}
