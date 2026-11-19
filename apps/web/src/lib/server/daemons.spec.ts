import { once } from 'node:events';
import { PROTOCOL_VERSION } from '@geordi/protocol';
import { prove } from '@geordi/protocol/auth';
import { WebSocket } from 'ws';
import { expect, it, vi } from 'vitest';
import { createHub } from './daemons.ts';

it('only reconciles the first authenticated daemon until it disconnects', async () => {
	const onHello = vi.fn();
	const hub = createHub(0, 'secret', { onHello, onMessage: vi.fn(), onUsage: vi.fn() });
	async function connect(id: string) {
		const socket = new WebSocket(`ws://127.0.0.1:${hub.port()}`);
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
		const active = await connect('a');
		await once(active, 'message');
		const second = await connect('b');
		expect((await once(second, 'close'))[0]).toBe(1008);
		expect(onHello).toHaveBeenCalledTimes(1);
		expect(hub.connected()).toEqual(['a']);
		active.close();
		await vi.waitFor(() => expect(hub.connected()).toEqual([]));
		const replacement = await connect('b');
		await once(replacement, 'message');
		expect(hub.connected()).toEqual(['b']);
		expect(onHello).toHaveBeenCalledTimes(2);
	} finally {
		hub.close();
	}
});
