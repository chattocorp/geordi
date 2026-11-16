import { describe, expect, it } from 'vitest';
import {
	add,
	close,
	flatten,
	groupsOf,
	insert,
	move,
	open,
	prune,
	resize,
	singleGroup,
	type Layout
} from './layout.ts';

/** The layout's shape, without IDs: tabs (active one starred) nested in split arrays. */
const shape = (layout: Layout): unknown =>
	layout.kind === 'group'
		? layout.tabs.map((tab) => (tab === layout.active ? `${tab}*` : tab)).join(' ')
		: [layout.dir, shape(layout.a), shape(layout.b)];

describe('layout', () => {
	const start = singleGroup(['a', 'b', 'c']);
	const [first] = groupsOf(start);

	it('opens new tabs in a group and activates existing ones', () => {
		expect(shape(open(start, 'd'))).toBe('a b c d*');
		expect(shape(open(start, 'b'))).toBe('a b* c');
	});

	it('adds tabs in the background', () => {
		expect(shape(add(start, 'd'))).toBe('a* b c d');
		expect(add(start, 'b')).toBe(start);
		expect(shape(add(singleGroup([]), 'a'))).toBe('a*');
	});

	it('closes tabs, activating a neighbour', () => {
		expect(shape(close(start, 'a'))).toBe('b* c');
		expect(shape(close(open(start, 'c'), 'c'))).toBe('a b*');
		expect(shape(close(close(close(start, 'a'), 'b'), 'c'))).toBe('');
	});

	it('splits a group by moving a tab to one of its sides', () => {
		expect(shape(move(start, 'b', first.id, 'right'))).toEqual(['row', 'a* c', 'b*']);
		expect(shape(move(start, 'b', first.id, 'top'))).toEqual(['column', 'b*', 'a* c']);
	});

	it('moves tabs between groups and collapses emptied ones', () => {
		const split = move(start, 'c', first.id, 'right');
		const [left, right] = groupsOf(split);
		expect(shape(move(split, 'a', right.id, 'center'))).toEqual(['row', 'b*', 'c a*']);
		expect(shape(move(split, 'c', left.id, 'center'))).toBe('a b c*');
		expect(shape(close(split, 'c'))).toBe('a* b');
	});

	it('ignores moves that would change nothing', () => {
		const single = singleGroup(['a']);
		expect(move(single, 'a', groupsOf(single)[0].id, 'left')).toBe(single);
		expect(move(start, 'a', first.id, 'center')).toBe(start);
		expect(move(start, 'missing', first.id, 'left')).toBe(start);
	});

	it('nests splits and resizes them', () => {
		const split = move(start, 'c', first.id, 'right');
		const nested = move(split, 'b', groupsOf(split)[1].id, 'bottom');
		expect(shape(nested)).toEqual(['row', 'a*', ['column', 'c*', 'b*']]);
		if (nested.kind !== 'split' || nested.b.kind !== 'split') throw new Error('expected splits');
		expect(resize(nested, nested.b.id, 0.3)).toMatchObject({ ratio: 0.5, b: { ratio: 0.3 } });
	});

	it('takes in a tab from elsewhere, into a group or beside it', () => {
		expect(shape(insert(start, 'x', first.id, 'center'))).toBe('a b c x*');
		expect(shape(insert(start, 'x', first.id, 'bottom'))).toEqual(['column', 'a* b c', 'x*']);
		expect(insert(start, 'x', 'no-such-group', 'center')).toBe(start);
	});

	it('prunes tabs', () => {
		expect(shape(prune(start, (tab) => tab !== 'b'))).toBe('a* c');
	});

	it('puts tabs in another order, within a group and coming from another', () => {
		const one = singleGroup(['a', 'b', 'c'], { id: 'one' });
		expect(shape(move(one, 'c', 'one', 'center', 'a'))).toBe('c* a b');
		expect(shape(move(one, 'a', 'one', 'center', null))).toBe('b c a*');
		expect(shape(move(one, 'a', 'one', 'center', 'c'))).toBe('b a* c');
		// dropped where it is, or on itself: nothing changes
		expect(move(one, 'a', 'one', 'center', 'b')).toBe(one);
		expect(move(one, 'b', 'one', 'center', 'b')).toBe(one);
		expect(move(one, 'c', 'one', 'center', null)).toBe(one);

		expect(shape(insert(one, 'x', 'one', 'center', 'b'))).toBe('a x* b c');
		const two = move(one, 'c', 'one', 'right');
		const other = groupsOf(two)[1].id;
		expect(shape(move(two, 'c', 'one', 'center', 'b'))).toBe('a c* b');
		expect(shape(move(two, 'a', other, 'center', 'c'))).toEqual(['row', 'b*', 'a* c']);
	});

	it('flattens a split layout into one group', () => {
		const one = singleGroup(['a', 'b', 'c'], { id: 'one' });
		const flat = flatten(move(one, 'c', 'one', 'bottom'), 'all');
		expect(flat.id).toBe('all');
		expect(shape(flat)).toBe('a* b c');
		expect(flatten(one, 'all')).toBe(one);
	});
});
