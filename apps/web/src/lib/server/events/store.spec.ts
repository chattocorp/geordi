import { describe, expect, it } from 'vitest';
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
});
