import { error } from '@sveltejs/kit';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createLive } from './live.ts';
import type { View } from './views.ts';

/** Lets what is on its way arrive. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 30));

let live: ReturnType<typeof createLive> | undefined;
afterEach(() => live?.close());

async function setup() {
	/** A view whose value we can change, and say so. */
	const state = { count: 1, changed: () => {}, following: 0 };
	const attached: string[] = [];
	const outputs = new Map<string, (data: string, replay: boolean) => void>();
	live = createLive({
		port: 0,
		host: '127.0.0.1',
		allowed: new Set(['127.0.0.1', 'localhost']),
		token: 'let-me-in',
		views: {
			counter: (key) => ({ read: () => ({ key, count: state.count }) }),
			missing: () => ({
				read: () => {
					error(404, 'Workspace not found');
				}
			})
		},
		async *values<T>(view: View<T>, signal: AbortSignal) {
			state.following++;
			try {
				while (!signal.aborted) {
					yield view.read();
					await new Promise<void>((resolve) => {
						state.changed = resolve;
						signal.addEventListener('abort', () => resolve(), { once: true });
					});
				}
			} finally {
				state.following--;
			}
		},
		terminal(at, listener) {
			const name = `${at.workspaceId}:${at.terminal}`;
			attached.push(name);
			outputs.set(name, listener);
			listener('before', true);
			return () => attached.splice(attached.indexOf(name), 1);
		}
	});
	await settled();
	const address = `ws://127.0.0.1:${live.port()}`;

	async function connect(
		origin: string | null = 'http://127.0.0.1:7717',
		token: string | null = 'let-me-in'
	) {
		const socket = new WebSocket(
			token === null ? address : `${address}/?token=${token}`,
			origin ? { origin } : {}
		);
		const got: Record<string, unknown>[] = [];
		socket.on('message', (raw) => got.push(JSON.parse(String(raw))));
		const opened = await new Promise<boolean>((resolve) => {
			socket.on('open', () => resolve(true));
			socket.on('error', () => resolve(false));
		});
		return { socket, got, opened, say: (message: object) => socket.send(JSON.stringify(message)) };
	}
	return { state, attached, outputs, connect };
}

describe('live', () => {
	it('turns away pages that are not our own', async () => {
		const { connect } = await setup();
		expect((await connect('http://evil.example')).opened).toBe(false);
		expect((await connect(null)).opened).toBe(false); // no page at all
		expect((await connect('http://localhost:5173')).opened).toBe(true);

		// a page from this machine that is not the forge's: it does not have the token
		expect((await connect('http://localhost:3000', null)).opened).toBe(false);
		expect((await connect('http://localhost:3000', 'a-guess')).opened).toBe(false);
		expect((await connect('http://localhost:3000', 'let-me-ix')).opened).toBe(false);
		// as many characters as the token, but not as many bytes: turned away, not fallen over
		expect((await connect('http://127.0.0.1:7717', 'let-me-%C3%AFn')).opened).toBe(false);
		expect((await connect()).opened).toBe(true);
	});

	it('sends a view now and whenever it is another, under the number it was asked by', async () => {
		const { connect, state } = await setup();
		const { got, say } = await connect();
		say({ follow: 7, view: 'counter', key: 'a' });
		await settled();
		expect(got).toEqual([{ id: 7, value: { key: 'a', count: 1 } }]);

		state.changed(); // something happened, but not to this
		await settled();
		expect(got).toHaveLength(1);

		state.count = 2;
		state.changed();
		await settled();
		expect(got.at(-1)).toEqual({ id: 7, value: { key: 'a', count: 2 } });
	});

	it('stops when told to, and when the window goes', async () => {
		const { connect, state } = await setup();
		const { socket, got, say } = await connect();
		say({ follow: 1, view: 'counter' });
		say({ follow: 2, view: 'counter' });
		await settled();
		expect(state.following).toBe(2);

		say({ drop: 1 });
		await settled();
		expect(state.following).toBe(1);
		const before = got.length;
		state.count = 5;
		state.changed();
		await settled();
		expect(got.slice(before)).toEqual([{ id: 2, value: { key: '', count: 5 } }]);

		socket.close();
		await settled();
		expect(state.following).toBe(0);
	});

	it('takes whatever is sent to it without falling over', async () => {
		const { connect } = await setup();
		const { socket, got, say } = await connect();
		for (const junk of ['null', '7', '[]', '"follow"', '{', '{"follow":"x"}', '{"drop":null}'])
			socket.send(junk);
		say({ follow: 1, view: 'counter' });
		await settled();
		expect(got).toEqual([{ id: 1, value: { key: '', count: 1 } }]);
	});

	it('says why there is nothing to send', async () => {
		const { connect } = await setup();
		const { got, say } = await connect();
		say({ follow: 1, view: 'missing' });
		say({ follow: 2, view: 'nothing-like-it' });
		say({ follow: 3, view: 'constructor' });
		await settled();
		expect(got).toEqual(
			expect.arrayContaining([
				{ id: 1, error: 'Workspace not found', status: 404 },
				{ id: 2, error: 'Nothing by that name', status: 404 },
				{ id: 3, error: 'Nothing by that name', status: 404 }
			])
		);
	});

	it("passes on a terminal's output, what it had put out before first", async () => {
		const { connect, attached, outputs } = await setup();
		const { got, say, socket } = await connect();
		say({ follow: 4, terminal: 'run-play', of: 'w' });
		say({ follow: 5, terminal: '../etc', of: 'w' });
		await settled();
		expect(attached).toEqual(['w:run-play']);
		expect(got).toEqual(
			expect.arrayContaining([
				{ id: 4, data: 'before', replay: true },
				{ id: 5, error: 'No such terminal', status: 404 }
			])
		);

		outputs.get('w:run-play')!('now', false);
		await settled();
		expect(got.at(-1)).toEqual({ id: 4, data: 'now', replay: false });

		socket.close();
		await settled();
		expect(attached).toEqual([]);
	});
});
