import type { TerminalSize, WorkspaceRef } from '@geordi/protocol';
import type { Dispatch } from './workspaces.ts';

/** How much output (in characters) is kept for browsers that connect later. */
const SCROLLBACK = 200_000;

type Terminal = {
	scrollback: string;
	/** Whether a daemon is running this terminal's shell. */
	running: boolean;
	size: TerminalSize;
	listeners: Set<Listener>;
};

/** `replay` marks old output, sent to catch a new viewer up. */
type Listener = (data: string, replay: boolean) => void;

/** Which of a workspace's terminals; the name is chosen by the browser that opened it. */
export type TerminalRef = { workspaceId: string; terminal: string };

const notice = (text: string) => `\r\n\x1b[2m${text}\x1b[0m\r\n`;

/**
 * Relays the shells of workspaces between browsers and the daemon running them. A shell
 * only ever starts because a person asked for it: by opening a terminal, or by pressing a
 * key in one that isn't running. Terminal I/O is deliberately not event-sourced (ADR-003):
 * only recent output is kept, in memory.
 */
export function createTerminals(dispatch: Dispatch, ref: (workspaceId: string) => WorkspaceRef) {
	/** By terminal ID, which is what daemons know a terminal as. */
	const terminals = new Map<string, Terminal>();

	const idOf = ({ workspaceId, terminal }: TerminalRef) => `${workspaceId}:${terminal}`;

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

	function start(at: TerminalRef) {
		const terminalId = idOf(at);
		const terminal = get(terminalId);
		if (terminal.running) return;
		terminal.running = dispatch({
			type: 'terminal.open',
			terminalId,
			...ref(at.workspaceId),
			...terminal.size
		});
		if (!terminal.running) emit(terminal, notice('No daemon connected. Press any key to retry.'));
	}

	function exit(terminal: Terminal) {
		if (!terminal.running) return;
		terminal.running = false;
		emit(terminal, notice('The shell exited. Press any key to start a new one.'));
	}

	return {
		/** Starts the terminal's shell, at the given size. */
		start(at: TerminalRef, size: TerminalSize) {
			get(idOf(at)).size = size;
			start(at);
		},

		/**
		 * Connects a viewer: replays recent output to `listener` and keeps it updated. Never
		 * starts a shell. Returns a function that disconnects the viewer.
		 */
		attach(at: TerminalRef, listener: Listener): () => void {
			ref(at.workspaceId); // 404s for unknown workspaces
			const terminal = get(idOf(at));
			if (terminal.scrollback) listener(terminal.scrollback, true);
			if (!terminal.running)
				listener(notice('This terminal is not running. Press any key to start it.'), false);
			terminal.listeners.add(listener);
			return () => terminal.listeners.delete(listener);
		},

		/** Passes input on. A key press in a terminal that isn't running starts it instead. */
		input(at: TerminalRef, data: string) {
			const terminalId = idOf(at);
			if (get(terminalId).running) dispatch({ type: 'terminal.input', terminalId, data });
			else start(at);
		},

		resize(at: TerminalRef, size: TerminalSize) {
			const terminalId = idOf(at);
			const terminal = get(terminalId);
			terminal.size = size;
			if (terminal.running) dispatch({ type: 'terminal.resize', terminalId, ...size });
		},

		/** Ends the shell and forgets the terminal. */
		close(at: TerminalRef) {
			const terminalId = idOf(at);
			if (terminals.get(terminalId)?.running) dispatch({ type: 'terminal.close', terminalId });
			terminals.delete(terminalId);
		},

		output(terminalId: string, data: string) {
			const terminal = terminals.get(terminalId);
			if (terminal) emit(terminal, data);
		},

		exit(terminalId: string) {
			const terminal = terminals.get(terminalId);
			if (terminal) exit(terminal);
		},

		/** A daemon (re)connected. Daemons end their shells when the connection drops. */
		reset() {
			for (const terminal of terminals.values()) exit(terminal);
		}
	};
}
