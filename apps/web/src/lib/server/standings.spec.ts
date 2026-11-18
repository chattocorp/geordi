import { describe, expect, it } from 'vitest';
import { createStandings, type Standing } from './standings.ts';

const standing = (pending = false): Standing => ({
	changes: { files: [], uncommitted: 0, unpushed: 0 },
	upstream: pending
		? ({ pull: { state: 'open', checks: { state: 'pending' } } } as unknown as Standing['upstream'])
		: null
});

function setup(ids: string[], busy: string[] = []) {
	const state = {
		now: 0,
		asked: [] as string[],
		pending: false,
		fails: false,
		watched: [] as string[][]
	};
	const standings = createStandings({
		worktrees: () => ids,
		load: async (id, fresh) => {
			state.asked.push(fresh ? `${id}!` : id);
			if (state.fails) throw new Error('no daemon');
			return standing(state.pending);
		},
		loadUpstream: async (id) => {
			state.asked.push(id + ' upstream');
			if (state.fails) throw new Error('offline');
			return standing(state.pending).upstream;
		},
		busy: (id) => busy.includes(id),
		watch: (ids) => state.watched.push([...ids]),
		now: () => state.now
	});
	return { standings, state };
}

describe('standings', () => {
	it('paces initial discovery and tells listeners after each result', async () => {
		const { standings, state } = setup(['a', 'b', 'c', 'd']);
		let told = 0;
		standings.subscribe(() => told++);
		expect(standings.get('a')).toBeNull();

		await standings.tick();
		expect(state.asked).toEqual(['a', 'b', 'c']);
		state.now = 9_999;
		await standings.tick();
		expect(state.asked).toHaveLength(3);
		state.now++;
		await standings.tick();
		expect(state.asked).toEqual(['a', 'b', 'c', 'd']);
		expect(standings.get('a')).toEqual(standing());
		expect(told).toBe(4);
		await standings.tick();
		expect(state.asked).toHaveLength(4); // all known, and fresh

		// grown old together, they are asked about a few at a time: upstream, and local Git
		state.now = 10 * 60_000;
		await standings.tick();
		expect(state.asked.slice(4)).toEqual(['a upstream', 'b upstream', 'c upstream', 'd']);
	});

	it('asks again at once about what nobody could say anything of', async () => {
		const { standings, state } = setup(['a']);
		state.fails = true;
		await standings.tick(); // no daemon yet
		state.fails = false;
		await standings.tick(); // wait before retrying missing worktrees
		expect(state.asked).toHaveLength(1);
		await standings.tick(true); // one connected
		expect(standings.get('a')).toEqual(standing());
	});

	it('asks again when what it knows is old: sooner while checks run', async () => {
		const { standings, state } = setup(['a']);
		await standings.tick();
		state.now = 90_000;
		await standings.tick();
		expect(state.asked).toHaveLength(1);
		state.now = 2 * 60_000;
		state.pending = true;
		await standings.tick();
		expect(state.asked).toHaveLength(2);
		state.now += 20_000;
		await standings.tick();
		expect(state.asked).toEqual(['a', 'a upstream', 'a upstream']);
	});

	it('refreshes a batch of running checks without running local Git for each one', async () => {
		const ids = Array.from({ length: 21 }, (_, index) => String(index));
		const { standings, state } = setup(ids);
		for (const id of ids) standings.note(id, standing(true));

		state.now = 20_000;
		state.pending = true;
		await standings.tick();
		expect(state.asked).toEqual(ids.slice(0, 20).map((id) => id + ' upstream'));

		// The next tick serves the outstanding workspace first, even as the others come due.
		state.asked.length = 0;
		state.now += 20_000;
		await standings.tick();
		expect(state.asked[0]).toBe('20 upstream');
	});

	it('picks up a running PR even when pushed branches use the search budget', async () => {
		const ids = ['a', 'b', 'c', 'd', 'running'];
		const { standings, state } = setup(ids);
		const pushed = { ...standing(true).upstream!, pull: null, refreshAfterMs: 10_000 };
		for (const id of ids) standings.note(id, { ...standing(), upstream: pushed });
		standings.note('running', standing(true));
		state.now = 10_000;
		await standings.tick();
		expect(state.asked).toEqual(['running upstream', 'a upstream', 'b upstream', 'c upstream']);
		state.now += 2_000;
		await standings.tick();
		expect(state.asked).toHaveLength(4);
		state.now += 8_000;
		await standings.tick();
		expect(state.asked.at(-1)).toBe('d upstream');
	});

	it('keeps a slow CI batch within its budget across overlapping ticks', async () => {
		const ids = Array.from({ length: 21 }, (_, index) => String(index));
		let now = 0;
		const reads: string[] = [];
		const slow = Promise.withResolvers<null>();
		const standings = createStandings({
			worktrees: () => ids,
			now: () => now,
			load: async () => standing(),
			loadUpstream: (id) => {
				reads.push(id);
				return slow.promise;
			}
		});
		for (const id of ids) standings.note(id, standing(true));
		now = 10_000;
		const first = standings.tick();
		now += 12_000;
		await standings.tick();
		expect(reads).toEqual(ids.slice(0, 20));
		slow.resolve(null);
		await first;
		await standings.tick();
		expect(reads).toEqual(ids);
	});

	it('takes what a viewer learnt, and keeps what it knew when nobody can say', async () => {
		const { standings, state } = setup(['a']);
		standings.note('a', standing(true));
		await standings.tick();
		expect(state.asked).toEqual([]); // just told

		state.now = 10 * 60_000;
		state.fails = true;
		await standings.tick();
		expect(standings.get('a')).toEqual(standing(true));
		await standings.tick();
		await standings.tick();
		expect(state.asked).toEqual(['a upstream', 'a']); // not asked over and over
	});

	it('asks as of now when something just happened there', async () => {
		const { standings, state } = setup(['a']);
		await standings.tick();
		await standings.refresh('a', true); // an agent's turn ended
		expect(state.asked).toEqual(['a', 'a!']);
	});

	it('looks at once at a worktree that changed, and no more often than every 15s while busy', async () => {
		const { standings, state } = setup(['idle', 'busy'], ['busy']);
		await standings.tick();
		state.asked.length = 0;

		state.now = 1_000;
		standings.changed('idle');
		standings.changed('busy');
		await Promise.resolve();
		expect(state.asked).toEqual(['idle']);

		state.now = 15_000;
		await standings.tick();
		expect(state.asked).toEqual(['idle', 'busy']);
		await standings.tick();
		expect(state.asked).toHaveLength(2); // looked at, and nothing changed since
	});

	it('looks upstream less often where an agent is at work', async () => {
		const { standings, state } = setup(['idle', 'busy'], ['busy']);
		standings.note('idle', standing(true));
		standings.note('busy', standing(true));
		state.pending = true;
		state.now = 10_000;
		await standings.tick();
		expect(state.asked).toEqual(['idle upstream']);
		state.now = 30_000;
		await standings.tick();
		expect(state.asked).toEqual(['idle upstream', 'idle upstream', 'busy upstream']);
	});

	it('has the worktrees in use watched, again when they change or a daemon reconnects', async () => {
		const ids = ['a', 'b'];
		const { standings, state } = setup(ids);
		await standings.tick();
		await standings.tick();
		ids.pop();
		await standings.tick();
		await standings.tick(true);
		expect(state.watched).toEqual([['a', 'b'], ['a'], ['a']]);
	});

	it('forgets worktrees that are no longer in use', async () => {
		const ids = ['a'];
		const { standings } = setup(ids);
		await standings.tick();
		ids.length = 0;
		await standings.tick();
		expect(standings.get('a')).toBeNull();
	});
});
