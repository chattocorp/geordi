import { describe, expect, it } from 'vitest';
import {
	byRepository,
	dropTarget,
	inFocus,
	asOneList,
	inSidebarOrder,
	nextUnread,
	stepThrough,
	unfolded,
	isInactive,
	withoutInactive,
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

describe('withoutInactive', () => {
	const all = [
		{ id: 'active', parentId: null },
		{ id: 'inactive', parentId: null, inactive: true },
		{ id: 'child', parentId: 'inactive', inactive: true },
		{ id: 'grandchild', parentId: 'child', inactive: true },
		{ id: 'helper', parentId: 'active' }
	];

	it('leaves out the inactive workspaces, where asked to', () => {
		expect(withoutInactive(all, false)).toBe(all);
		expect(withoutInactive(all, true).map(({ id }) => id)).toEqual(['active', 'helper']);
	});

	it('keeps the workspace on screen, in its place with those that started it', () => {
		expect(withoutInactive(all, true, 'inactive').map(({ id }) => id)).toEqual([
			'active',
			'inactive',
			'helper'
		]);
		expect(withoutInactive(all, true, 'grandchild').map(({ id }) => id)).toEqual([
			'active',
			'inactive',
			'child',
			'grandchild',
			'helper'
		]);
	});
});

describe('byRepository', () => {
	it('lists workspaces by repository, in the order given', () => {
		const repos = byRepository([
			workspace('a', 'one'),
			workspace('b', 'two'),
			workspace('c', 'one')
		]);
		expect([...repos.keys()]).toEqual(['one', 'two']);
		expect(ids(repos.get('one'))).toEqual(['a', 'c']);
	});

	it('puts a workspace right after the one whose agent started it, however deep', () => {
		const repos = byRepository([
			workspace('grandchild', 'one', 'child'),
			workspace('other', 'one'),
			workspace('child', 'one', 'parent'),
			workspace('sibling', 'one', 'parent'),
			workspace('parent', 'one')
		]);
		expect(ids(repos.get('one'))).toEqual(['other', 'parent', 'child', 'grandchild', 'sibling']);
		expect(repos.get('one')?.[2].parent?.id).toBe('parent');
		expect(repos.get('one')?.[0].parent).toBeNull();
		expect(repos.get('one')?.map(({ depth }) => depth)).toEqual([0, 0, 1, 2, 1]);
	});

	it('lists a tree in its root’s repository, children from elsewhere too (FDR-016)', () => {
		const repos = byRepository([
			workspace('parent', 'one'),
			workspace('abroad', 'two', 'parent'),
			workspace('orphan', 'two', 'archived')
		]);
		expect(ids(repos.get('one'))).toEqual(['parent', 'abroad']);
		expect(repos.get('one')?.[1].parent?.id).toBe('parent');
		expect(ids(repos.get('two'))).toEqual(['orphan']);
		expect(repos.get('two')?.[0].parent).toBeNull();
	});

	it('keeps projects and repositories apart', () => {
		const repos = byRepository([workspace('p', null), workspace('started', 'one', 'p')]);
		expect(ids(repos.get(null))).toEqual(['p']);
		expect(ids(repos.get('one'))).toEqual(['started']);
	});

	it('lists a loop rather than losing it', () => {
		const repos = byRepository([workspace('a', 'one', 'b'), workspace('b', 'one', 'a')]);
		expect(ids(repos.get('one'))?.sort()).toEqual(['a', 'b']);
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
	const rows = byRepository([
		workspace('parent', 'one'),
		workspace('child', 'one', 'parent'),
		workspace('grandchild', 'one', 'child'),
		workspace('sibling', 'one', 'parent'),
		workspace('other', 'one')
	]).get('one')!;

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
	const rows = byRepository(all).get('one')!;
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
		const project = workspace('p', null);
		const list = asOneList([project, workspace('a', 'one')]);
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

describe('inSidebarOrder', () => {
	const all = [
		workspace('a', 'one'),
		workspace('b', 'two'),
		workspace('child', 'one', 'a'),
		workspace('c', 'one')
	];

	it('lists by repository, each started one after its parent', () => {
		expect(inSidebarOrder(all, ['two', 'one'], []).map(({ id }) => id)).toEqual([
			'b',
			'a',
			'child',
			'c'
		]);
	});

	it('leaves out what is folded away', () => {
		expect(inSidebarOrder(all, ['one', 'two'], ['a']).map(({ id }) => id)).toEqual(['a', 'c', 'b']);
		expect(inSidebarOrder(all, ['one', 'two'], ['one']).map(({ id }) => id)).toEqual(['b']);
	});

	it('lists as one, in the order given, when not grouped', () => {
		const order = (folded: string[]) =>
			inSidebarOrder(all, ['one', 'two'], folded, { grouped: false }).map(({ id }) => id);
		expect(order([])).toEqual(['a', 'child', 'b', 'c']);
		expect(order(['a'])).toEqual(['a', 'b', 'c']);
		expect(order(['one'])).toEqual(['a', 'child', 'b', 'c']);
	});
});

describe('asOneList', () => {
	it('keeps a started one under its parent, from another repository too', () => {
		const all = [workspace('p', null), workspace('a', 'one'), workspace('child', 'one', 'p')];
		expect(asOneList(all).map(({ workspace, depth }) => [workspace.id, depth])).toEqual([
			['p', 0],
			['child', 1],
			['a', 0]
		]);
	});
});

describe('inFocus', () => {
	const repos = [{ id: 'one' }, { id: 'two' }];

	it('keeps only the repository in focus', () => {
		expect(inFocus(repos, 'two')).toEqual([{ id: 'two' }]);
	});

	it('shows all without a focus, or with one on a repository not listed', () => {
		expect(inFocus(repos, null)).toEqual(repos);
		expect(inFocus(repos, 'gone')).toEqual(repos);
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
