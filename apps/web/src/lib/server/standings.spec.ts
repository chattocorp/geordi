import { describe, expect, it } from 'vitest';
import { createStandings, type Standing } from './standings.ts';

const standing = (pending = false): Standing => ({
	changes: { files: [], uncommitted: 0, unpushed: 0 },
	upstream: pending
		? ({ pull: { state: 'open', checks: { state: 'pending' } } } as unknown as Standing['upstream'])
		: null
});

function setup(ids: string[]) {
	const state = { now: 0, asked: [] as string[], pending: false, fails: false };
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
		now: () => state.now
	});
	return { standings, state };
}

describe('standings', () => {
	it('asks about every worktree it knows nothing of at once, and tells who listens', async () => {
		const { standings, state } = setup(['a', 'b', 'c', 'd']);
		let told = 0;
		standings.subscribe(() => told++);
		expect(standings.get('a')).toBeNull();

		await standings.tick();
		expect(state.asked).toEqual(['a', 'b', 'c', 'd']);
		expect(standings.get('a')).toEqual(standing());
		expect(told).toBe(4);
		await standings.tick();
		expect(state.asked).toHaveLength(4); // all known, and fresh

		// grown old together, they are asked about a few at a time
		state.now = 10 * 60_000;
		await standings.tick();
		expect(state.asked).toHaveLength(7);
	});

	it('asks again at once about what nobody could say anything of', async () => {
		const { standings, state } = setup(['a']);
		state.fails = true;
		await standings.tick(); // no daemon yet
		state.fails = false;
		await standings.tick(); // one connected
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
		expect(state.asked).toEqual(['a', 'a', 'a upstream']);
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
		expect(state.asked).toHaveLength(1); // not asked over and over
	});

	it('asks as of now when something just happened there', async () => {
		const { standings, state } = setup(['a']);
		await standings.tick();
		await standings.refresh('a', true); // an agent's turn ended
		expect(state.asked).toEqual(['a', 'a!']);
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
