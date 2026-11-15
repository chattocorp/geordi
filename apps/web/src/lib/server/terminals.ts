import type { DaemonResults, TerminalSize, WorktreeRef } from '@geordi/protocol';
import type { Dispatch } from './workspaces.ts';

type Terminal = {
	/** Whether a daemon is running this terminal's shell. */
	running: boolean;
	size: TerminalSize;
	viewers: Set<Viewer>;
};

/** Gets live output; `offset` is its position in the shell's whole output. */
type Viewer = (data: string, offset: number) => void;

/** `replay` marks old output, sent to catch a new viewer up. */
type Listener = (data: string, replay: boolean) => void;

/** Which of a workspace's terminals; the name is chosen by the browser that opened it. */
export type TerminalRef = { workspaceId: string; terminal: string };

const notice = (text: string) => `\r\n\x1b[2m${text}\x1b[0m\r\n`;

/**
 * Relays the shells of workspaces between browsers and the daemon running them. Shells and
 * their scrollback live in the daemon (ADR-003); the forge keeps nothing it couldn't learn
 * again from a daemon, so it can restart without disturbing them.
 *
 * A shell only ever starts because a person asked for it: by opening a terminal, or by
 * pressing a key in one that isn't running.
 */
export function createTerminals(
	dispatch: Dispatch,
	/** Asks the daemon for a terminal's recent output. */
	scrollback: (terminalId: string) => Promise<DaemonResults['scrollback']>,
	ref: (workspaceId: string) => WorktreeRef
) {
	/** By terminal ID, which is what daemons know a terminal as. */
	const terminals = new Map<string, Terminal>();

	const idOf = ({ workspaceId, terminal }: TerminalRef) => `${workspaceId}:${terminal}`;

	/** Called whenever a shell starts or ends, so viewers can show the terminals there are. */
	const listeners = new Set<() => void>();
	const changed = () => listeners.forEach((listener) => listener());

	function get(id: string): Terminal {
		let terminal = terminals.get(id);
		if (!terminal) {
			terminal = { running: false, size: { cols: 80, rows: 24 }, viewers: new Set() };
			terminals.set(id, terminal);
		}
		return terminal;
	}

	/** Lets go of a terminal that neither runs nor is looked at: there is nothing left to know. */
	function forget(id: string) {
		const terminal = terminals.get(id);
		if (terminal && !terminal.running && terminal.viewers.size === 0) terminals.delete(id);
	}

	const emit = (terminal: Terminal, data: string, offset: number) => {
		for (const viewer of terminal.viewers) viewer(data, offset);
	};
	/** Something the forge has to say; it belongs after any output. */
	const tell = (terminal: Terminal, text: string) => emit(terminal, notice(text), Infinity);

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
		if (terminal.running) changed();
		else tell(terminal, 'No daemon connected. Press any key to retry.');
	}

	function exit(terminal: Terminal) {
		if (!terminal.running) return;
		terminal.running = false;
		tell(terminal, 'The shell exited. Press any key to start a new one.');
		changed();
	}

	return {
		/** Starts the terminal's shell, at the given size. */
		start(at: TerminalRef, size: TerminalSize) {
			get(idOf(at)).size = size;
			start(at);
		},

		/**
		 * Connects a viewer: replays the terminal's recent output to `listener`, then keeps it
		 * updated. Never starts a shell. Returns a function that disconnects the viewer.
		 */
		attach(at: TerminalRef, listener: Listener): () => void {
			ref(at.workspaceId); // 404s for unknown workspaces
			const terminalId = idOf(at);
			const terminal = get(terminalId);

			// Output that arrives while we wait for the scrollback may or may not be part of
			// it. Hold it back, then pass on only what the scrollback doesn't have yet.
			let early: { data: string; offset: number }[] | null = [];
			const viewer: Viewer = (data, offset) => {
				if (early) early.push({ data, offset });
				else listener(data, false);
			};
			terminal.viewers.add(viewer);

			scrollback(terminalId)
				.catch(() => null)
				.then((replay) => {
					if (!terminal.viewers.has(viewer)) return;
					// A daemon that has scrollback is running the shell, whatever we thought (we
					// may have just restarted). The reverse doesn't hold: the shell may have been
					// started after we asked.
					if (replay && !terminal.running) {
						terminal.running = true;
						changed();
					}
					if (replay?.data) listener(replay.data, true);
					for (const { data, offset } of early ?? [])
						if (offset >= (replay?.end ?? 0)) listener(data, false);
					early = null;
					if (!terminal.running)
						listener(notice('This terminal is not running. Press any key to start it.'), false);
				});

			return () => {
				terminal.viewers.delete(viewer);
				forget(terminalId);
			};
		},

		/** Passes input on. A key press in a terminal that isn't running starts it instead. */
		input(at: TerminalRef, data: string) {
			const terminalId = idOf(at);
			if (get(terminalId).running) dispatch({ type: 'terminal.input', terminalId, data });
			else start(at);
		},

		resize(at: TerminalRef, size: TerminalSize) {
			const terminalId = idOf(at);
			// only terminals someone is looking at have a size to remember
			const terminal = terminals.get(terminalId);
			if (!terminal) return;
			terminal.size = size;
			if (terminal.running) dispatch({ type: 'terminal.resize', terminalId, ...size });
		},

		/** Ends the shell. Whoever is still looking keeps looking, at a terminal that isn't running. */
		close(at: TerminalRef) {
			const terminalId = idOf(at);
			const terminal = terminals.get(terminalId);
			if (!terminal) return;
			if (terminal.running) dispatch({ type: 'terminal.close', terminalId });
			terminal.running = false;
			forget(terminalId);
			changed();
		},

		/** The names of a workspace's terminals whose shells are running. */
		running(workspaceId: string): string[] {
			const prefix = `${workspaceId}:`;
			return [...terminals]
				.filter(([id, terminal]) => id.startsWith(prefix) && terminal.running)
				.map(([id]) => id.slice(prefix.length));
		},

		/** Calls `listener` whenever a shell starts or ends. Returns a function that stops it. */
		subscribe(listener: () => void): () => void {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},

		/** Ends every shell of a workspace, e.g. because its directory is about to go. */
		closeAll(workspaceId: string) {
			for (const [terminalId, terminal] of terminals) {
				if (!terminalId.startsWith(`${workspaceId}:`)) continue;
				if (terminal.running) dispatch({ type: 'terminal.close', terminalId });
				terminal.running = false;
				forget(terminalId);
			}
			changed();
		},

		output(terminalId: string, data: string, offset: number) {
			const terminal = terminals.get(terminalId);
			if (terminal) emit(terminal, data, offset);
		},

		exit(terminalId: string) {
			const terminal = terminals.get(terminalId);
			if (terminal) exit(terminal);
		},

		/**
		 * A daemon (re)connected and says which terminals it is running. Others have ended
		 * while we weren't connected; ones we don't know are from before we restarted.
		 */
		reconcile(running: string[]) {
			for (const [id, terminal] of terminals) if (!running.includes(id)) exit(terminal);
			for (const id of running) get(id).running = true;
			changed();
		}
	};
}
