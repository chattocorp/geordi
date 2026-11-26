import { describe, expect, it } from 'vitest';
import {
	dropTarget,
	nested,
	nextUnread,
	outlineRows,
	stepThrough,
	unfolded,
	isInactive,
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

	it('leaves out what is done and inactive, with what is under it, unless it is on screen', () => {
		expect(shown({ activeOnly: true })).toEqual(['release', 'bump', 'detail', 'elsewhere']);
		expect(shown({ activeOnly: true, viewed: 'under-quiet' })).toEqual([
			'release',
			'bump',
			'detail',
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
	const place = (from: number, over: number, zone: 'above' | 'onto' | 'below', top = true) => {
		const target = dropTarget(rows, at(from), over, zone, top);
		return target && [target.parentId, target.before, target.reparents];
	};

	it('moves a workspace among its siblings', () => {
		expect(place(1, 3, 'below')).toEqual(['parent', 'third', false]);
		expect(place(1, 4, 'below')).toEqual(['parent', null, false]);
		expect(place(4, 1, 'above')).toEqual(['parent', 'child', false]);
	});

	it('nests it under the row it is dropped onto, as the last child', () => {
		expect(place(5, 3, 'onto')).toEqual(['sibling', null, true]);
		expect(place(4, 1, 'onto')).toEqual(['child', null, true]);
	});

	it('puts it first under a row with children, dropped below it', () => {
		expect(place(5, 0, 'below')).toEqual(['parent', 'child', true]);
		expect(dropTarget(rows, at(5), 0, 'below', true)?.line).toEqual({ id: 'child', edge: 'above' });
	});

	it('moves it up a level, or to the top', () => {
		expect(place(2, 3, 'above')).toEqual(['parent', 'sibling', true]);
		expect(place(1, 5, 'above')).toEqual([null, 'other', true]);
		expect(place(1, 5, 'below')).toEqual([null, null, true]);
	});

	it('puts it last at the top level, dropped below the list', () => {
		expect(place(2, 6, 'below')).toEqual([null, null, true]);
		expect(place(0, 6, 'below')).toEqual([null, null, false]);
		expect(dropTarget(rows, at(2), 6, 'below', true)?.line).toEqual({ id: null, edge: 'below' });
		expect(place(5, 6, 'below')).toBeUndefined(); // last already
		expect(place(2, 6, 'below', false)).toBeUndefined();
	});

	it('keeps it at the top of its own repository’s list only', () => {
		expect(place(1, 5, 'above', false)).toBeUndefined();
		expect(place(1, 3, 'onto', false)).toEqual(['sibling', null, true]);
	});

	it('never puts it under itself', () => {
		expect(place(1, 1, 'onto')).toBeUndefined();
		expect(place(1, 2, 'onto')).toBeUndefined();
		expect(place(0, 4, 'above')).toBeUndefined();
	});

	it('says nothing where the row would stay', () => {
		expect(place(1, 3, 'above')).toBeUndefined();
		expect(place(4, 3, 'below')).toBeUndefined();
		expect(place(4, 0, 'onto')).toBeUndefined();
	});

	it('keeps projects out of the tree', () => {
		const project = { ...workspace('p', null), project: true };
		const list = nested([project, workspace('a', 'one')]);
		expect(dropTarget(list, all[0], 0, 'onto', true)).toBeUndefined();
		expect(dropTarget(list, project, 1, 'onto', true)).toBeUndefined();
		expect(dropTarget(list, project, 1, 'below', true)?.parentId).toBeNull();
	});

	it('takes a workspace from another list', () => {
		const stranger = workspace('stranger', 'two');
		expect(dropTarget(rows, stranger, 5, 'onto', false)).toMatchObject({
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
