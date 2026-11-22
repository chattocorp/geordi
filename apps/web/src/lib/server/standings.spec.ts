import type { Changes, Upstream } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { createStandings, type Local } from './standings.ts';

/** Lets pending loads settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve));

const changes = (patch: Partial<Changes> = {}): Changes => ({
	branch: 'geordi/w',
	files: [],
	uncommitted: 0,
	unpushed: 0,
	landed: false,
	...patch
});

const upstream = (patch: Partial<Upstream> = {}): Upstream => ({
	forge: 'github',
	repo: 'a/b',
	repoUrl: null,
	branch: 'geordi/w',
	localBranch: 'geordi/w',
	pushed: true,
	createUrl: null,
	pull: null,
	...patch
});

function setup(ids: string[], { busy = [] as string[], open = [] as string[] } = {}) {
	const state = {
		now: 0,
		asked: [] as string[],
		local: { changes: changes(), unavailable: null, missing: false } as Local,
		upstream: null as Upstream | null,
		/** Why the forge cannot be asked, if it cannot. */
		offline: null as string | null,
		/** Answers held back until released. */
		held: [] as (() => void)[],
		hold: false,
		watched: [] as string[][],
		warned: [] as string[],
		told: [] as string[]
	};
	const wait = () =>
		state.hold ? new Promise<void>((resolve) => state.held.push(resolve)) : Promise.resolve();
	const standings = createStandings({
		worktrees: () => ids,
		loadLocal: async (id) => {
			state.asked.push(id);
			const answer = state.local;
			await wait();
			return answer;
		},
		loadUpstream: async (id, fresh) => {
			state.asked.push(`${id} upstream${fresh ? '!' : ''}`);
			const answer = state.upstream && { checkedAt: state.now, ...state.upstream };
			const offline = state.offline;
			await wait();
			if (offline) throw new Error(offline);
			return answer;
		},
		busy: (id) => busy.includes(id),
		open: (id) => open.includes(id),
		watch: (ids) => state.watched.push([...ids]),
		warn: (id, problem) => state.warned.push(`${id}: ${problem}`),
		now: () => state.now
	});
	standings.subscribe((id) => state.told.push(id));
	const release = async () => {
		for (const resolve of state.held.splice(0)) resolve();
		await settled();
	};
	return { standings, state, release };
}

describe('standings', () => {
	it('looks at everything at first: local Git a few at a time, upstream all at once', async () => {
		const { standings, state, release } = setup(['a', 'b', 'c', 'd']);
		expect(standings.get('a')).toBeNull();

		state.hold = true;
		void standings.tick();
		await settled();
		expect(state.asked).toEqual([
			'a',
			'b',
			'c',
			'a upstream',
			'b upstream',
			'c upstream',
			'd upstream'
		]);
		// a look done: the next one starts at once, not on the next tick
		state.hold = false;
		await release();
		expect(state.asked.slice(7)).toEqual(['d']);
		expect(standings.get('a')).toEqual({ changes: changes(), upstream: null });
		expect(standings.state('d')).toMatchObject({ version: 1, checking: false });
		expect(new Set(state.told)).toEqual(new Set(['a', 'b', 'c', 'd']));
		await standings.tick();
		expect(state.asked).toHaveLength(8); // all known, and fresh
	});

	it('shows local changes whatever the forge does, and says when it cannot be asked', async () => {
		const { standings, state } = setup(['a']);
		state.upstream = upstream({ refreshAfterMs: 10_000 });
		await standings.tick();
		const known = standings.get('a')?.upstream;
		expect(known).toMatchObject({ pushed: true });

		state.offline = 'GitHub is down';
		state.local = { ...state.local, changes: changes({ uncommitted: 2 }) };
		standings.changed('a');
		state.now = 10_000;
		await standings.tick();
		// once may be a hiccup
		expect(standings.state('a')).toMatchObject({
			changes: { uncommitted: 2 },
			upstream: known,
			upstreamProblem: null
		});
		state.now = 20_000;
		await standings.tick();
		expect(standings.state('a')).toMatchObject({
			upstream: known,
			upstreamProblem: 'GitHub is down'
		});
		state.now = 30_000;
		await standings.tick();
		expect(state.warned).toEqual(['a: GitHub is down']);

		state.offline = null;
		state.now = 40_000;
		await standings.tick();
		expect(standings.state('a')).toMatchObject({ upstream: known, upstreamProblem: null });
	});

	it('is not left checking by a forge that never answers, and asks again soon', async () => {
		const { standings, state } = setup(['a']);
		state.offline = 'offline';
		await standings.tick();
		expect(standings.state('a')).toMatchObject({ checking: false, upstream: null });
		state.now = 19_999;
		await standings.tick();
		expect(state.asked).toHaveLength(2);
		state.now++;
		await standings.tick();
		expect(state.asked.slice(2)).toEqual(['a upstream']);
	});

	it('keeps what it knew locally when nobody can say, and asks again soon', async () => {
		const { standings, state } = setup(['a']);
		state.local = { changes: null, unavailable: 'No daemon connected', missing: false };
		await standings.tick();
		expect(standings.state('a')).toMatchObject({
			changes: null,
			unavailable: 'No daemon connected'
		});
		state.now = 5000;
		// a daemon is there: at once
		state.local = { changes: changes({ uncommitted: 1 }), unavailable: null, missing: false };
		await standings.tick(true);
		expect(standings.get('a')?.changes?.uncommitted).toBe(1);

		state.local = { changes: null, unavailable: 'No daemon connected', missing: false };
		state.now = 70_000;
		await standings.tick();
		expect(standings.state('a')).toMatchObject({ changes: { uncommitted: 1 }, version: 2 });
	});

	it('asks nothing upstream about a worktree that is not there', async () => {
		const { standings, state } = setup(['a']);
		state.local = { changes: null, unavailable: 'gone', missing: true };
		await standings.tick();
		await standings.tick();
		expect(state.asked).toEqual(['a', 'a upstream']);
		state.now = 30_000;
		await standings.tick();
		expect(state.asked).toHaveLength(2);
		expect(standings.state('a')).toMatchObject({ missing: true, checking: false });
		// made: the forge is asked at once
		state.local = { changes: changes(), unavailable: null, missing: false };
		standings.changed('a');
		await settled();
		expect(state.asked.slice(2)).toEqual(['a', 'a upstream']);
	});

	it('asks upstream again when what it knows is old: as soon as the daemon says', async () => {
		const { standings, state } = setup(['a']);
		await standings.tick();
		state.now = 2 * 60_000 - 1;
		await standings.tick();
		expect(state.asked.filter((asked) => asked.endsWith('upstream'))).toHaveLength(1);
		state.upstream = upstream({ refreshAfterMs: 10_000 });
		state.now++;
		await standings.tick();
		state.now += 9_999;
		await standings.tick();
		expect(state.asked.filter((asked) => asked.endsWith('upstream'))).toHaveLength(2);
		state.now++;
		await standings.tick();
		expect(state.asked.filter((asked) => asked.endsWith('upstream'))).toHaveLength(3);
	});

	it('keeps a slow batch of looks upstream within its budget across overlapping ticks', async () => {
		const ids = Array.from({ length: 25 }, (_, index) => `w${index}`);
		const { standings, state, release } = setup(ids);
		state.upstream = upstream({ refreshAfterMs: 10_000 });
		for (let round = 0; round < 12; round++) await standings.tick();
		const asked = () => state.asked.filter((entry) => entry.endsWith('upstream')).length;
		expect(asked()).toBe(25);

		state.now = 10_000;
		state.hold = true;
		void standings.tick();
		void standings.tick();
		await settled();
		expect(asked()).toBe(45);
		await release();
		state.now = 19_999;
		void standings.tick();
		await settled();
		expect(asked()).toBe(45);
		state.now = 20_000;
		void standings.tick();
		await settled();
		expect(asked()).toBe(65);
		await release();
	});

	it('looks upstream less often where an agent is at work, unless someone has it open', async () => {
		const { standings, state } = setup(['a', 'b'], { busy: ['a', 'b'], open: ['b'] });
		state.upstream = upstream({ refreshAfterMs: 10_000 });
		await standings.tick();
		state.now = 10_000;
		await standings.tick();
		expect(state.asked.filter((asked) => asked.endsWith('upstream'))).toEqual([
			'a upstream',
			'b upstream',
			'b upstream'
		]);
		state.now = 30_000;
		await standings.tick();
		expect(state.asked.filter((asked) => asked === 'a upstream')).toHaveLength(2);
	});

	it('looks at once at a worktree that changed, and every 15s at one with an agent at work', async () => {
		const { standings, state } = setup(['a', 'b', 'c'], { busy: ['b', 'c'], open: ['c'] });
		await standings.tick();
		const local = () => state.asked.slice(6).filter((asked) => !asked.endsWith('upstream'));

		standings.changed('a');
		standings.changed('b');
		// someone is looking: at once, whoever is at work
		standings.changed('c');
		await settled();
		expect(local()).toEqual(['a', 'c']);
		state.now = 14_999;
		await standings.tick();
		expect(local()).toEqual(['a', 'c']);
		state.now++;
		await standings.tick();
		expect(local()).toEqual(['a', 'c', 'b']);
		// what a daemon missed shows a minute later
		state.now = 60_000;
		await standings.tick();
		// the one someone has open first
		expect(local()).toEqual(['a', 'c', 'b', 'c', 'a', 'b']);
	});

	it('looks first at a worktree someone has open when a daemon connects', async () => {
		const ids = ['a', 'b', 'c', 'd', 'e'];
		const { standings, state, release } = setup(ids, { open: ['e'] });
		// no daemon yet: the open one was tried last
		state.local = { changes: null, unavailable: 'No daemon connected', missing: false };
		await standings.tick();
		await standings.tick();
		state.now = 1000;
		await standings.look('e');
		state.asked = [];

		state.local = { changes: changes(), unavailable: null, missing: false };
		state.hold = true;
		void standings.tick(true);
		await settled();
		const local = () => state.asked.filter((asked) => !asked.includes('upstream'));
		expect(local()).toEqual(['e', 'a', 'b']);
		// one at a time as each finishes, never more than three
		state.held.shift()?.();
		await settled();
		expect(local()).toEqual(['e', 'a', 'b', 'c']);
		state.hold = false;
		await release();
		expect(local()).toEqual(['e', 'a', 'b', 'c', 'd']);
		expect(ids.every((id) => standings.state(id)?.changes)).toBe(true);
	});

	it('follows a look in flight with another when the worktree changes meanwhile', async () => {
		const { standings, state, release } = setup(['a'], { open: ['a'] });
		await standings.tick();
		state.hold = true;
		standings.changed('a');
		standings.changed('a');
		standings.changed('a');
		await settled();
		expect(state.asked.slice(2)).toEqual(['a']);
		state.hold = false;
		await release();
		expect(state.asked.slice(2)).toEqual(['a', 'a']);
		expect(standings.state('a')?.version).toBe(3);
	});

	it('asks upstream at once after a push, and as of now on another branch', async () => {
		const { standings, state, release } = setup(['a'], { open: ['a'] });
		state.local = { ...state.local, changes: changes({ unpushed: 1 }) };
		state.upstream = upstream();
		await standings.tick();
		expect(standings.get('a')?.upstream).toMatchObject({ localBranch: 'geordi/w' });

		state.local = { ...state.local, changes: changes({ unpushed: 0 }) };
		standings.changed('a');
		await settled();
		expect(state.asked.slice(2)).toEqual(['a', 'a upstream']);

		// on another branch: what is known is not about it
		state.local = { ...state.local, changes: changes({ branch: 'other' }) };
		state.hold = true;
		standings.changed('a');
		await settled();
		state.upstream = upstream({ localBranch: 'other', branch: 'other' });
		await release();
		expect(standings.state('a')).toMatchObject({ upstream: null, checking: true });
		expect(state.asked.slice(4)).toEqual(['a', 'a upstream!']);
		state.hold = false;
		await release();
		expect(standings.state('a')).toMatchObject({ upstream: { branch: 'other' }, checking: false });
	});

	it('looks as of now when something may have happened upstream, and says so meanwhile', async () => {
		const { standings, state, release } = setup(['a']);
		state.upstream = upstream({ refreshAfterMs: 10_000 });
		await standings.tick();
		const before = standings.get('a')?.upstream;

		// an ordinary look is under way when the turn ends: its answer no longer counts
		state.hold = true;
		state.now = 10_000;
		void standings.tick();
		await settled();
		const stale = state.held.splice(0);
		state.upstream = upstream({
			refreshAfterMs: 10_000,
			pull: { number: '7' } as Upstream['pull']
		});
		const looked = standings.look('a', { fresh: true, announce: true });
		await settled();
		expect(standings.state('a')).toMatchObject({ checking: true, upstream: before });
		expect(state.asked.at(-1)).toBe('a upstream!');
		state.hold = false;
		await release();
		await looked;
		expect(standings.state('a')).toMatchObject({
			checking: false,
			upstream: { pull: { number: '7' } }
		});
		for (const resolve of stale) resolve();
		await settled();
		expect(standings.get('a')?.upstream?.pull?.number).toBe('7');
	});

	it('tells nobody of an answer that says nothing new', async () => {
		const { standings, state } = setup(['a']);
		state.upstream = upstream({ refreshAfterMs: 10_000 });
		await standings.tick();
		const known = standings.get('a')?.upstream;
		state.told = [];
		state.now = 10_000;
		await standings.tick();
		expect(state.asked.at(-1)).toBe('a upstream');
		expect(state.told).toEqual([]);
		expect(standings.get('a')?.upstream).toBe(known);
		// still due again a whole interval later, not at once
		state.now = 19_999;
		await standings.tick();
		expect(state.asked.filter((asked) => asked.endsWith('upstream'))).toHaveLength(2);
	});

	it('does not keep asking a daemon that has nothing newer to say', async () => {
		const { standings, state } = setup(['a'], { open: ['a'] });
		state.local = { ...state.local, changes: changes({ unpushed: 1 }) };
		state.upstream = upstream({ refreshAfterMs: 10_000 });
		await standings.tick();
		const asked = () => state.asked.filter((entry) => entry.endsWith('upstream')).length;

		// the daemon's earlier answer again, after a push: due when that one was
		state.upstream = upstream({ refreshAfterMs: 10_000, checkedAt: 0 });
		state.now = 6000;
		state.local = { ...state.local, changes: changes({ unpushed: 0 }) };
		standings.changed('a');
		await settled();
		expect(asked()).toBe(2);
		state.now = 10_000;
		await standings.tick();
		expect(asked()).toBe(3);
		// rate limited: still its old answer, so not again until another interval has passed
		state.now = 12_000;
		await standings.tick();
		expect(asked()).toBe(3);
		state.now = 20_000;
		await standings.tick();
		expect(asked()).toBe(4);
	});

	it('has the worktrees in use watched, again when they change or a daemon reconnects', async () => {
		const ids = ['a', 'b'];
		const { standings, state } = setup(ids);
		await standings.tick();
		await standings.tick();
		expect(state.watched).toEqual([['a', 'b']]);
		ids.push('c');
		await standings.tick();
		await standings.tick(true);
		expect(state.watched).toEqual([
			['a', 'b'],
			['a', 'b', 'c'],
			['a', 'b', 'c']
		]);
	});

	it('forgets worktrees that are no longer in use', async () => {
		const ids = ['a', 'b'];
		const { standings } = setup(ids);
		await standings.tick();
		ids.pop();
		await standings.tick();
		expect(standings.get('a')).not.toBeNull();
		expect(standings.get('b')).toBeNull();
	});
});
