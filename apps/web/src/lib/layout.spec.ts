import { describe, expect, it } from 'vitest';
import {
	add,
	close,
	groupsOf,
	move,
	open,
	prune,
	replace,
	resize,
	singleGroup,
	splitOf,
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

	it('keeps a sticky group in place when it empties, as somewhere to drop tabs', () => {
		const pane = singleGroup(['t'], { id: 'pane', sticky: true });
		const layout = splitOf('column', 0.4, singleGroup(['a']), pane);

		const emptied = close(layout, 't');
		expect(shape(emptied)).toEqual(['column', 'a*', '']);
		// tabs can be put into it by name, moved into it, and it can be split
		expect(shape(add(emptied, 'new', 'pane'))).toEqual(['column', 'a*', 'new*']);
		expect(shape(move(layout, 'a', 'pane', 'center'))).toBe('t a*');
		expect(shape(move(add(layout, 'b'), 'a', 'pane', 'left'))).toEqual([
			'column',
			'b*',
			['row', 'a*', 't*']
		]);
		// and its only tab can be dragged out to elsewhere
		const [first] = groupsOf(layout);
		expect(shape(move(layout, 't', first.id, 'center'))).toEqual(['column', 'a t*', '']);
	});

	it('replaces and prunes tabs', () => {
		expect(shape(replace(start, 'a', 'x'))).toBe('x* b c');
		expect(shape(prune(start, (tab) => tab !== 'b'))).toBe('a* c');
	});
});
