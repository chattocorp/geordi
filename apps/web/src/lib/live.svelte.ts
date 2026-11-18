import { ForgeConnection } from './forge-connection.svelte.ts';
import { applyWorkspaceUpdate } from './workspace-update.ts';
import type { WorkspaceLive } from './server/views.ts';

/**
 * What is live on the page: the sidebar's data, a workspace, its terminals. All of it comes
 * over one WebSocket per window (see `#lib/server/live.ts` for why, and for what is said
 * over it), opened when the page says where (`connect`), and opened again whenever it drops.
 */

/** Something followed: what it is, and what is known of it. */
class Followed<T> {
	/** The latest value; `undefined` until the first arrives. */
	current = $state.raw<T>();
	/** Why there is none, if the forge said so (a workspace that doesn't exist, say). */
	error = $state.raw<{ message: string; status?: number }>();
	/** Whether `current` is from the connection there is now, not from one that dropped. */
	fresh = $state(false);
	/** How many components follow it: nobody, and it is let go. */
	held = 0;

	constructor(
		readonly id: number,
		readonly view: string,
		readonly key: string
	) {}
}

/** A terminal on screen: what it does with its output. */
type Terminal = {
	of: string;
	terminal: string;
	/** The connection (re)opened: what follows starts over, with the terminal's recent output. */
	open(): void;
	/** Output: `replay` for what the terminal had put out before. */
	data(data: string, replay: boolean): void;
};

// Bookkeeping, never shown: what is shown are the values, which are reactive themselves.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const followed = new Map<string, Followed<unknown>>();
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const byId = new Map<number, Followed<unknown> | Terminal>();
let numbers = 0;

let socket: WebSocket | undefined;
let address: string | undefined;
let retry = 0;

export const connection = new ForgeConnection();

const say = (message: object) =>
	socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));

const ask = (id: number, what: Followed<unknown> | Terminal) =>
	say(
		what instanceof Followed
			? { follow: id, view: what.view, key: what.key }
			: { follow: id, terminal: what.terminal, of: what.of }
	);

function open() {
	if (!address || socket) return;
	const opened = new WebSocket(address);
	socket = opened;
	opened.onopen = () => {
		connection.opened();
		retry = 0;
		for (const [id, what] of byId) {
			if (!(what instanceof Followed)) what.open();
			ask(id, what);
		}
	};
	opened.onmessage = (event) => {
		const message = JSON.parse(event.data);
		const what = byId.get(message.id);
		if (!what) return;
		if (!(what instanceof Followed)) {
			// (nothing to show for a terminal there is no following: it stays as it is)
			if (typeof message.data === 'string') what.data(message.data, message.replay === true);
			return;
		}
		if ('error' in message) what.error = { message: message.error, status: message.status };
		else {
			what.current =
				what.view === 'workspace'
					? applyWorkspaceUpdate(what.current as WorkspaceLive | undefined, message.value)
					: message.value;
			what.error = undefined;
		}
		what.fresh = true;
	};
	opened.onclose = () => {
		if (socket !== opened) return;
		socket = undefined;
		connection.waiting();
		for (const what of followed.values()) what.fresh = false;
		// again soon, and then not too often: the forge may be restarting
		setTimeout(open, Math.min(5000, 250 * 2 ** retry++));
	};
	opened.onerror = () => opened.close();
}

/**
 * Says where the forge's WebSocket is (its port, on the page's own host) and what to show
 * there to be let in, and connects.
 */
export function connect({ port, token }: { port: number; token: string }) {
	if (typeof window === 'undefined' || address) return;
	const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
	address = `${scheme}://${location.hostname}:${port}/?token=${encodeURIComponent(token)}`;
	connection.waiting();
	open();
}

/**
 * Follows a view of the forge's (by its name in `#lib/server/views.ts`), for as long as the
 * component that asks is there. `key` says which one (a workspace's ID, say), and may
 * change; `undefined` for none yet. What comes back is reactive: `current` is the latest
 * value (`undefined` until the first), `error` why there is none, `connected` whether it is
 * up to date. Never awaited: a page that waits for its data holds up its own leaving.
 */
export function follow<T>(view: string, key: () => string | undefined = () => '') {
	let now = $state.raw<Followed<T>>();

	$effect(() => {
		const which = key();
		if (which === undefined) return void (now = undefined);
		const name = `${view} ${which}`;
		let what = followed.get(name) as Followed<T> | undefined;
		if (!what) {
			what = new Followed<T>(++numbers, view, which);
			followed.set(name, what as Followed<unknown>);
			byId.set(what.id, what as Followed<unknown>);
			ask(what.id, what as Followed<unknown>);
		}
		what.held++;
		now = what;
		const held = what;
		return () => {
			if (--held.held > 0) return;
			followed.delete(name);
			byId.delete(held.id);
			say({ drop: held.id });
		};
	});

	return {
		get current() {
			return now?.current;
		},
		get error() {
			return now?.error;
		},
		get connected() {
			return now?.fresh ?? false;
		}
	};
}

/** Follows a terminal's output. Returns a function that stops. */
export function followTerminal(terminal: Terminal): () => void {
	const id = ++numbers;
	byId.set(id, terminal);
	if (socket?.readyState === WebSocket.OPEN) {
		terminal.open();
		ask(id, terminal);
	}
	return () => {
		byId.delete(id);
		say({ drop: id });
	};
}
