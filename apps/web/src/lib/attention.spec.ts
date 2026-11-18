import { describe, expect, it } from 'vitest';
import { busy, cameToRest, outcome, type Member, type TurnEnd } from './attention.ts';

const member = (over: Partial<Member> = {}): Member => ({
	status: 'idle',
	lastTurn: 'completed',
	queue: [],
	updatedAt: '2026-11-16T10:00:00Z',
	...over
});

describe('busy', () => {
	it('is busy while running', () => {
		expect(busy(member({ status: 'running', lastTurn: null }))).toBe(true);
		expect(busy(member())).toBe(false);
	});

	it('is busy between a completed turn and the waiting message it goes on to', () => {
		expect(busy(member({ queue: ['next'] }))).toBe(true);
	});

	it('is at rest after a failed turn, even with messages waiting', () => {
		expect(busy(member({ lastTurn: 'failed', queue: ['next'] }))).toBe(false);
	});
});

describe('outcome', () => {
	it('is a question for the person as soon as an agent asks one, though it is at work', () => {
		const asking = member({ status: 'running', lastTurn: null, asking: true });
		expect(outcome([member(), asking])).toBe('asking');
		// which is theirs to hear of, whoever else waits for the agent
		const before = new Map([['child', null]]);
		const now = [
			{ id: 'parent', parentId: null, outcome: null },
			{ id: 'child', parentId: 'parent', outcome: 'asking' as const }
		];
		expect(cameToRest(before, now).map((workspace) => workspace.id)).toEqual(['child']);
	});

	it('is null while anyone is busy, or before any turn', () => {
		expect(outcome([member(), member({ status: 'running', lastTurn: null })])).toBeNull();
		expect(outcome([member({ lastTurn: null })])).toBeNull();
	});

	it('is how the turn that ended last ended', () => {
		const early = member({ lastTurn: 'failed', updatedAt: '2026-11-16T09:00:00Z' });
		expect(outcome([early, member()])).toBe('completed');
		expect(outcome([member({ updatedAt: '2026-11-16T08:00:00Z' }), early])).toBe('failed');
	});
});

describe('cameToRest', () => {
	const seen = (entries: [string, TurnEnd | null][]) => new Map(entries);
	const ws = (id: string, outcome: TurnEnd | null, parentId: string | null = null) => ({
		id,
		parentId,
		outcome
	});

	it('tells of a workspace that was busy and is now at rest', () => {
		expect(cameToRest(seen([['a', null]]), [ws('a', 'completed')])).toEqual([ws('a', 'completed')]);
		expect(cameToRest(seen([['a', null]]), [ws('a', 'failed')])).toEqual([ws('a', 'failed')]);
	});

	it('tells of nothing first seen, nor still busy, nor at rest already', () => {
		expect(cameToRest(seen([]), [ws('a', 'completed')])).toEqual([]);
		expect(cameToRest(seen([['a', null]]), [ws('a', null)])).toEqual([]);
		expect(cameToRest(seen([['a', 'completed']]), [ws('a', 'completed')])).toEqual([]);
	});

	it('keeps quiet about a stopped turn', () => {
		expect(cameToRest(seen([['a', null]]), [ws('a', 'stopped')])).toEqual([]);
	});

	it('keeps quiet while the agent that started it is at work', () => {
		const before = seen([
			['parent', null],
			['child', null]
		]);
		expect(cameToRest(before, [ws('parent', null), ws('child', 'completed', 'parent')])).toEqual(
			[]
		);
		// once nobody waits for it, it is the person's
		expect(
			cameToRest(seen([['child', null]]), [
				ws('parent', 'completed'),
				ws('child', 'completed', 'parent')
			])
		).toEqual([ws('child', 'completed', 'parent')]);
	});
});
