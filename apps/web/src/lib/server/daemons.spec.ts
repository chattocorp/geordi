import { once } from 'node:events';
import { PROTOCOL_VERSION } from '@geordi/protocol';
import { prove } from '@geordi/protocol/auth';
import { WebSocket } from 'ws';
import { expect, it, vi } from 'vitest';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createHub, daemonAdmission } from './daemons.ts';

it('only reconciles the first authenticated daemon until it disconnects', async () => {
	const onHello = vi.fn();
	const hub = createHub(0, 'secret', {
		admit: () => true,
		onHello,
		onMessage: vi.fn(),
		onUsage: vi.fn(),
		onLimits: vi.fn()
	});
	async function connect(id: string, autoPong = true) {
		const socket = new WebSocket(`ws://127.0.0.1:${hub.port()}`, { autoPong });
		const [challenge] = await once(socket, 'message');
		socket.send(
			JSON.stringify({
				type: 'hello',
				daemonId: id,
				nonce: 'test',
				protocol: PROTOCOL_VERSION,
				proof: prove('secret', 'daemon', JSON.parse(String(challenge)).nonce),
				running: [],
				terminals: [],
				harnesses: []
			})
		);
		return socket;
	}
	try {
		await vi.waitFor(() => expect(hub.port()).toBeTruthy());
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		const active = await connect('a', false);
		await once(active, 'message');
		const second = await connect('b');
		expect((await once(second, 'close'))[0]).toBe(1008);
		expect(onHello).toHaveBeenCalledTimes(1);
		expect(hub.connected()).toEqual(['a']);
		const disconnected = once(active, 'close');
		vi.advanceTimersByTime(30_000);
		await disconnected;
		vi.useRealTimers();
		await vi.waitFor(() => expect(hub.connected()).toEqual([]));
		const replacement = await connect('b');
		await once(replacement, 'message');
		expect(hub.connected()).toEqual(['b']);
		expect(onHello).toHaveBeenCalledTimes(2);
	} finally {
		vi.useRealTimers();
		hub.close();
	}
});

it('remembers which daemon can recover unfinished turns across forge restart', () => {
	const store = new EventStore<GeordiEvent>(':memory:');
	let running = false;
	const start = () => daemonAdmission(store, () => running);
	expect(start()('owner')).toBe(true);
	running = true;
	const restarted = start();
	expect(restarted('other')).toBe(false);
	expect(restarted('owner')).toBe(true);
	running = false;
	expect(restarted('other')).toBe(true);
	expect(store.readAll().map((event) => event.data.id)).toEqual(['owner', 'other']);
	store.close();
});
