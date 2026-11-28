import { describe, expect, it } from 'vitest';
import {
	dropTarget,
	gapDepths,
	nested,
	nextUnread,
	outlineRows,
	stepThrough,
	unfolded,
	isInactive,
	zoomedInto,
	zoomTrail,
	withAides
} from './family.ts';

const workspace = (id: string, repoId: string | null, parentId: string | null = null) => ({
	id,
	repoId,
	parentId
});
const ids = (listed: { workspace: { id: string } }[] | undefined) =>
	listed?.map(({ workspace }) => workspace.id);

describe('isInactive', () => {
	const byId = new Map(
		[
			{ id: 'inactive', parentId: null, inactive: true },
			{ id: 'child', parentId: 'inactive' },
			{ id: 'grandchild', parentId: 'child' },
			{ id: 'archived', parentId: 'inactive', archivedAt: '2026-01-01' },
			{ id: 'orphan', parentId: 'archived' },
			{ id: 'active', parentId: null }
		].map((w) => [w.id, w])
	);

	it('counts what an inactive workspace started, at any depth, as inactive too', () => {
		expect(['inactive', 'child', 'grandchild'].map((id) => isInactive(byId, id))).toEqual([
			true,
			true,
			true
		]);
		expect(isInactive(byId, 'active')).toBe(false);
	});

	it('stops at an archived workspace, as at one gone', () => {
		expect(isInactive(byId, 'orphan')).toBe(false);
	});
});

describe('nested', () => {
	it('puts each item right after its parent, however deep, in the order given', () => {
		const rows = nested([
			workspace('grandchild', 'one', 'child'),
			workspace('other', 'one'),
			workspace('child', 'one', 'parent'),
			workspace('sibling', 'two', 'parent'),
			workspace('parent', 'one')
		]);
		expect(ids(rows)).toEqual(['other', 'parent', 'child', 'grandchild', 'sibling']);
		expect(rows[2].parent?.id).toBe('parent');
		expect(rows[0].parent).toBeNull();
		expect(rows.map(({ depth }) => depth)).toEqual([0, 0, 1, 2, 1]);
	});

	it('lists one whose parent is gone at the top, and a loop rather than losing it', () => {
		expect(ids(nested([workspace('orphan', 'one', 'gone')]))).toEqual(['orphan']);
		expect(ids(nested([workspace('a', 'one', 'b'), workspace('b', 'one', 'a')]))?.sort()).toEqual([
			'a',
			'b'
		]);
	});
});

describe('outlineRows', () => {
	const item = (id: string, parentId: string | null = null, done = false, workspace = false) => ({
		id,
		parentId,
		text: id,
		note: '',
		done,
		workspace
	});
	const items = [
		item('release'),
		item('bump', 'release', false, true),
		item('detail', 'bump'),
		item('ticked', 'bump', true),
		item('quiet', 'release', false, true),
		item('under-quiet', 'quiet'),
		item('elsewhere', null, false, true)
	];
	const workspaces = [
		{ id: 'bump', repoId: 'geordi' },
		{ id: 'quiet', repoId: 'geordi', inactive: true },
		{ id: 'elsewhere', repoId: 'sample' }
	];
	const shown = (options: Parameters<typeof outlineRows>[2]) =>
		ids(outlineRows(items, workspaces, options));

	it('shows every item, each under its parent', () => {
		expect(shown({})).toEqual([
			'release',
			'bump',
			'detail',
			'ticked',
			'quiet',
			'under-quiet',
			'elsewhere'
		]);
	});

	it('leaves out inactive workspaces, with what is under them, unless on screen; never ticked items', () => {
		// what is ticked off stays, crossed out
		expect(shown({ activeOnly: true })).toEqual([
			'release',
			'bump',
			'detail',
			'ticked',
			'elsewhere'
		]);
		expect(shown({ activeOnly: true, viewed: 'under-quiet' })).toEqual([
			'release',
			'bump',
			'detail',
			'ticked',
			'quiet',
			'under-quiet',
			'elsewhere'
		]);
	});

	it('never hides a workspace in use under one that is done', () => {
		const rows = outlineRows(
			[
				item('gone', null, true, true),
				item('carries-on', 'gone', false, true),
				item('old', 'gone')
			],
			[{ id: 'carries-on', repoId: 'geordi' }],
			{ activeOnly: true }
		);
		expect(ids(rows)).toEqual(['gone', 'carries-on']);
	});

	it('shows a repository’s workspaces, what is above them and what is under them', () => {
		expect(shown({ focus: 'sample' })).toEqual(['elsewhere']);
		expect(shown({ focus: 'geordi' })).toEqual([
			'release',
			'bump',
			'detail',
			'ticked',
			'quiet',
			'under-quiet'
		]);
		// a repository with nothing shows everything
		expect(shown({ focus: 'gone' })).toHaveLength(items.length);
	});

	it('folds, and marks projects', () => {
		expect(shown({ folded: ['bump'] })).not.toContain('detail');
		const rows = outlineRows([item('p', null, false, true)], [{ id: 'p', repoId: null }]);
		expect(rows[0].workspace.project).toBe(true);
	});
});

describe('withAides', () => {
	const at = (id: string, worktreeId = id) => ({ id, worktreeId });

	it('gives each workspace the agents working in its directory, oldest first', () => {
		const sorted = withAides([at('second', 'work'), at('other'), at('first', 'work'), at('work')]);
		expect(sorted.map(({ workspace }) => workspace.id)).toEqual(['other', 'work']);
		expect(sorted[1].aides.map((aide) => aide.id)).toEqual(['first', 'second']);
		expect(sorted[0].aides).toEqual([]);
	});

	it('lets an agent stand for itself once the workspace it worked in is gone', () => {
		const sorted = withAides([at('left', 'archived')]);
		expect(sorted.map(({ workspace }) => workspace.id)).toEqual(['left']);
	});
});

describe('unfolded', () => {
	const rows = nested([
		workspace('parent', 'one'),
		workspace('child', 'one', 'parent'),
		workspace('grandchild', 'one', 'child'),
		workspace('sibling', 'one', 'parent'),
		workspace('other', 'one')
	]);

	it('counts what is under each row', () => {
		expect(unfolded(rows, []).map(({ under }) => under)).toEqual([3, 1, 0, 0, 0]);
	});

	it('hides what is under a folded workspace, however deep', () => {
		expect(ids(unfolded(rows, ['parent']))).toEqual(['parent', 'other']);
		expect(ids(unfolded(rows, ['child']))).toEqual(['parent', 'child', 'sibling', 'other']);
	});

	it('ignores a folded workspace with nothing under it', () => {
		expect(ids(unfolded(rows, ['other', 'grandchild']))).toEqual(ids(rows));
	});
});

describe('dropTarget', () => {
	// 0 parent, 1 child, 2 grandchild, 3 sibling, 4 third, 5 other
	const all = [
		workspace('parent', 'one'),
		workspace('child', 'one', 'parent'),
		workspace('grandchild', 'one', 'child'),
		workspace('sibling', 'one', 'parent'),
		workspace('third', 'one', 'parent'),
		workspace('other', 'one')
	];
	const rows = nested(all);
	const at = (index: number) => all.find(({ id }) => id === rows[index].workspace.id)!;
	const gap = (from: number, after: number, depth: number, top = true) => {
		const target = dropTarget(rows, at(from), { after, depth }, top);
		return target && [target.parentId, target.before, target.reparents];
	};
	const onto = (from: number, row: number) => {
		const target = dropTarget(rows, at(from), { onto: row }, true);
		return target && [target.parentId, target.before, target.reparents];
	};

	it('knows the depths each gap allows', () => {
		expect(gapDepths(rows, -1)).toEqual([0, 0]);
		expect(gapDepths(rows, 0)).toEqual([1, 1]); // above the first child: only under it
		expect(gapDepths(rows, 2)).toEqual([1, 2]);
		expect(gapDepths(rows, 4)).toEqual([0, 1]);
		expect(gapDepths(rows, 5)).toEqual([0, 0]);
	});

	it('moves a workspace among its siblings', () => {
		expect(gap(4, 0, 1)).toEqual(['parent', 'child', false]);
		expect(gap(1, 3, 1)).toEqual(['parent', 'third', false]);
	});

	it('takes the depth the pointer asks for, within what the gap allows', () => {
		expect(gap(5, 2, 2)).toEqual(['child', null, true]);
		expect(gap(5, 2, 1)).toEqual(['parent', 'sibling', true]);
		expect(gap(5, 2, 0)).toEqual(['parent', 'sibling', true]);
		expect(gap(1, 4, 9)).toEqual(['parent', null, false]);
		expect(gap(1, 4, 0)).toEqual([null, 'other', true]);
		expect(gap(1, 5, 4)).toEqual([null, null, true]);
	});

	it('shows one line for a gap, in at the depth it drops at', () => {
		expect(dropTarget(rows, at(5), { after: 2, depth: 1 }, true)?.line).toEqual({
			id: 'grandchild',
			edge: 'below',
			depth: 1
		});
		expect(dropTarget(rows, at(5), { after: -1, depth: 3 }, true)?.line).toEqual({
			id: 'parent',
			edge: 'above',
			depth: 0
		});
	});

	it('nests it under the row it is dropped onto, as the last child', () => {
		expect(onto(5, 3)).toEqual(['sibling', null, true]);
		expect(onto(4, 1)).toEqual(['child', null, true]);
	});

	it('moves a row up a level from below its own last row', () => {
		expect(gap(2, 2, 1)).toEqual(['parent', 'sibling', true]);
	});

	it('keeps it at the top only where that is allowed', () => {
		expect(gap(1, 4, 0, false)).toBeUndefined();
		expect(onto(1, 3)).toEqual(['sibling', null, true]);
	});

	it('never puts it under itself', () => {
		expect(onto(1, 1)).toBeUndefined();
		expect(onto(1, 2)).toBeUndefined();
		expect(gap(0, 1, 1)).toBeUndefined();
		expect(gap(1, 2, 2)).toBeUndefined();
	});

	it('says nothing where the row would stay', () => {
		expect(gap(1, 0, 1)).toBeUndefined();
		expect(gap(4, 4, 1)).toBeUndefined();
		expect(onto(4, 0)).toBeUndefined();
		expect(gap(5, 5, 0)).toBeUndefined();
	});

	it('keeps projects out of the tree', () => {
		const project = { ...workspace('p', null), project: true };
		const list = nested([project, workspace('a', 'one')]);
		expect(dropTarget(list, all[0], { onto: 0 }, true)).toBeUndefined();
		expect(dropTarget(list, project, { onto: 1 }, true)).toBeUndefined();
		expect(dropTarget(list, project, { after: 1, depth: 0 }, true)?.parentId).toBeNull();
	});

	it('takes a workspace from elsewhere', () => {
		const stranger = workspace('stranger', 'two');
		expect(dropTarget(rows, stranger, { onto: 5 }, false)).toMatchObject({
			parentId: 'other',
			reparents: true
		});
	});
});

describe('stepThrough', () => {
	const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

	it('steps forward and back, round at the ends', () => {
		expect(stepThrough(order, 'b', 1)?.id).toBe('c');
		expect(stepThrough(order, 'c', 1)?.id).toBe('a');
		expect(stepThrough(order, 'a', -1)?.id).toBe('c');
	});

	it('starts at the first or last from outside the list', () => {
		expect(stepThrough(order, null, 1)?.id).toBe('a');
		expect(stepThrough(order, null, -1)?.id).toBe('c');
		expect(stepThrough([], null, 1)).toBeUndefined();
	});
});

describe('nextUnread', () => {
	const order = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
	const unread = new Set(['a', 'd']);

	it('starts after the current row, skips read rows, and wraps', () => {
		expect(nextUnread(order, 'b', unread)?.id).toBe('d');
		expect(nextUnread(order, 'd', unread)?.id).toBe('a');
		expect(nextUnread(order, null, unread)?.id).toBe('a');
	});

	it('stays put when no other listed workspace is unread', () => {
		expect(nextUnread(order, 'a', new Set(['a', 'hidden']))).toBeUndefined();
		expect(nextUnread(order, null, new Set())).toBeUndefined();
	});
});

describe('zooming', () => {
	const item = (id: string, parentId: string | null, workspace = false) => ({
		id,
		parentId,
		text: id,
		note: '',
		done: false,
		workspace
	});
	const items = [
		item('release', null),
		item('lead', 'release', true),
		item('step', 'lead'),
		item('detail', 'step'),
		item('child', 'step', true),
		item('elsewhere', null)
	];
	const ids = (list: { id: string }[]) => list.map(({ id }) => id);

	it('shows everything under the item zoomed into, workspaces and all', () => {
		expect(ids(zoomedInto(items, 'lead'))).toEqual(['step', 'detail', 'child']);
		expect(ids(zoomedInto(items, 'detail'))).toEqual([]);
	});

	it('shows everything when not zoomed, or zoomed into what is gone', () => {
		expect(zoomedInto(items, null)).toBe(items);
		expect(zoomedInto(items, 'gone')).toBe(items);
	});

	it('leads down to it from the top', () => {
		expect(ids(zoomTrail(items, 'step'))).toEqual(['release', 'lead', 'step']);
		// gone: nothing to lead down
		expect(zoomTrail(items, 'gone')).toEqual([]);
		expect(zoomTrail(items, null)).toEqual([]);
	});
});
