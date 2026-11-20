import { describe, expect, it, vi } from 'vitest';
import { EventStore } from './store';

type TestEvent = { type: 'counted'; stream: string; data: { by: number } };
const counted = (by: number, stream = 'counter:1'): TestEvent => ({
	type: 'counted',
	stream,
	data: { by }
});

describe('EventStore', () => {
	it('appends and reads events in order', () => {
		const store = new EventStore<TestEvent>(':memory:');
		store.append([counted(1), counted(2, 'counter:2')], { actor: 'hendrik' });
		store.append(counted(3));

		const all = store.readAll();
		expect(all.map((e) => [e.seq, e.data.by, e.actor])).toEqual([
			[1, 1, 'hendrik'],
			[2, 2, 'hendrik'],
			[3, 3, null]
		]);
		expect(store.readAll(2).map((e) => e.seq)).toEqual([3]);
		expect(store.readStream('counter:1').map((e) => e.data.by)).toEqual([1, 3]);
	});

	it('passes over an event a projection or listener fails on, so replay still starts', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const store = new EventStore<TestEvent>(':memory:');
			const evolve = (sum: number, e: { data: { by: number } }) => {
				if (e.data.by === 13) throw new Error('unlucky');
				return sum + e.data.by;
			};
			const total = store.project('total', () => 0, evolve);
			const heard: number[] = [];
			store.subscribe(() => {
				throw new Error('deaf');
			});
			store.subscribe((events) => heard.push(...events.map((e) => e.data.by)));

			expect(store.append([counted(1), counted(13), counted(2)])).toHaveLength(3);
			expect(total.get()).toBe(3);
			expect(heard).toEqual([1, 13, 2]);

			// the event is in the log: replaying it must not fail either
			expect(store.project('again', () => 0, evolve).get()).toBe(3);
			expect(error).toHaveBeenCalledTimes(3);
		} finally {
			error.mockRestore();
		}
	});

	it('replays existing events into new projections and keeps them updated', () => {
		const store = new EventStore<TestEvent>(':memory:');
		store.append([counted(1), counted(2)]);

		const total = store.project(
			'total',
			() => 0,
			(sum, e) => sum + e.data.by
		);
		expect(total.get()).toBe(3);

		store.append(counted(4));
		expect(total.get()).toBe(7);
	});

	it('filters before parsing replay rows and applies the same filter on append', () => {
		const store = new EventStore(':memory:');
		const image = { type: 'image.added', stream: 'image:i', data: { base64: 'old payload' } };
		const created = { type: 'workspace.created', stream: 'workspace:w', data: {} };
		store.append([image, created]);
		const parse = vi.spyOn(JSON, 'parse');
		try {
			const projection = store.project(
				'workspaces',
				() => 0,
				(n) => n + 1,
				['workspace', 'session']
			);
			expect(parse.mock.calls.map(([data]) => data)).toEqual(['{}']);
			store.append([image, { ...created, type: 'session.message' }]);
			expect(projection.get()).toBe(2);
		} finally {
			parse.mockRestore();
			store.close();
		}
	});

	it('updates projections before notifying listeners', () => {
		const store = new EventStore<TestEvent>(':memory:');
		const total = store.project(
			'total',
			() => 0,
			(sum, e) => sum + e.data.by
		);
		const seen: number[] = [];
		store.subscribe(() => seen.push(total.get()));

		store.append(counted(5));
		expect(seen).toEqual([5]);
	});

	it('replaces projections registered under the same name', () => {
		const store = new EventStore<TestEvent>(':memory:');
		const calls: string[] = [];
		store.project(
			'p',
			() => null,
			() => (calls.push('old'), null)
		);
		store.project(
			'p',
			() => null,
			() => (calls.push('new'), null)
		);

		store.append(counted(1));
		expect(calls).toEqual(['new']);
	});

	it('streams fresh values after each append via live()', async () => {
		const store = new EventStore<TestEvent>(':memory:');
		const total = store.project(
			'total',
			() => 0,
			(sum, e) => sum + e.data.by
		);
		const live = store.live(() => total.get());

		expect((await live.next()).value).toBe(0);
		const next = live.next();
		store.append(counted(2));
		expect((await next).value).toBe(2);

		await live.return(undefined);
	});

	it('reads again for another reason too, and lets go of it when done', async () => {
		const store = new EventStore<TestEvent>(':memory:');
		let outside = 'a';
		let changed = () => {};
		let listening = false;
		const live = store.live(
			() => outside,
			(notify) => {
				changed = notify;
				listening = true;
				return () => (listening = false);
			}
		);

		expect((await live.next()).value).toBe('a');
		const next = live.next();
		outside = 'b';
		changed();
		expect((await next).value).toBe('b');

		expect(listening).toBe(true);
		await live.return(undefined);
		expect(listening).toBe(false);
	});

	it('lets go of the store when the other reason cannot be set up', async () => {
		const store = new EventStore<TestEvent>(':memory:');
		let subscribed = 0;
		const subscribe = store.subscribe.bind(store);
		store.subscribe = (listener) => {
			subscribed++;
			const unsubscribe = subscribe(listener);
			return () => (subscribed--, unsubscribe());
		};

		const live = store.live(
			() => 1,
			() => {
				throw new Error('no such thing');
			}
		);
		await expect(live.next()).rejects.toThrow('no such thing');
		expect(subscribed).toBe(0);
	});

	it('ends, and lets go of everything, when its signal says the reader has gone', async () => {
		const store = new EventStore<TestEvent>(':memory:');
		const gone = new AbortController();
		let listening = true;
		const live = store.live(
			() => 1,
			() => () => (listening = false),
			gone.signal
		);

		await live.next();
		const waiting = live.next(); // waits for a change that never comes
		gone.abort();
		expect((await waiting).done).toBe(true);
		expect(listening).toBe(false);
	});
});
