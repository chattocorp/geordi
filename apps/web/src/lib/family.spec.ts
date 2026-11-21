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
	withAides
} from './family.ts';

const workspace = (id: string, repoId: string | null, parentId: string | null = null) => ({
	id,
	repoId,
	parentId
});
const ids = (listed: { workspace: { id: string } }[] | undefined) =>
	listed?.map(({ workspace }) => workspace.id);

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

	it('lists a workspace whose parent is elsewhere, or gone, on its own', () => {
		const repos = byRepository([
			workspace('parent', 'one'),
			workspace('abroad', 'two', 'parent'),
			workspace('orphan', 'two', 'archived')
		]);
		expect(ids(repos.get('two'))).toEqual(['abroad', 'orphan']);
		expect(repos.get('two')?.[0].parent?.id).toBe('parent');
		expect(repos.get('two')?.[1].parent).toBeNull();
		expect(repos.get('two')?.map(({ depth }) => depth)).toEqual([0, 0]);
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
	const rows = byRepository([
		workspace('parent', 'one'),
		workspace('child', 'one', 'parent'),
		workspace('grandchild', 'one', 'child'),
		workspace('sibling', 'one', 'parent'),
		workspace('third', 'one', 'parent'),
		workspace('other', 'one')
	]).get('one')!;

	it('moves a child among its siblings, past their own children', () => {
		expect(dropTarget(rows, rows[1].workspace, 3, false)).toEqual({
			before: 'third',
			after: 'third'
		});
		expect(dropTarget(rows, rows[1].workspace, 4, false)).toEqual({ before: null, after: 'third' });
		expect(dropTarget(rows, rows[4].workspace, 2, false)).toEqual({
			before: 'sibling',
			after: 'third'
		});
		expect(dropTarget(rows, rows[4].workspace, 1, true)).toEqual({
			before: 'child',
			after: 'third'
		});
	});

	it('never changes the parent', () => {
		expect(dropTarget(rows, rows[1].workspace, 0, false)).toBeUndefined();
		expect(dropTarget(rows, rows[1].workspace, 5, true)).toBeUndefined();
		expect(dropTarget(rows, rows[2].workspace, 3, true)).toBeUndefined();
	});

	it('says nothing where the row would stay', () => {
		expect(dropTarget(rows, rows[1].workspace, 1, true)).toBeUndefined();
		expect(dropTarget(rows, rows[1].workspace, 2, false)).toBeUndefined();
		expect(dropTarget(rows, rows[1].workspace, 3, true)).toBeUndefined();
	});

	it('accepts an incoming row before, between or after destination siblings', () => {
		const incoming = workspace('incoming', 'one');
		expect(dropTarget(rows, incoming, 0, true)?.before).toBe('parent');
		expect(dropTarget(rows, incoming, 0, false)?.before).toBe('other');
		expect(dropTarget(rows, incoming, 5, false)?.before).toBeNull();
		const child = workspace('incoming', 'one', 'parent');
		expect(dropTarget(rows, child, 3, true)?.before).toBe('sibling');
		expect(dropTarget(rows, child, 5, true)).toBeUndefined();
	});

	it('moves a workspace at the top with its family', () => {
		expect(dropTarget(rows, rows[0].workspace, 5, false)).toEqual({ before: null, after: 'other' });
		expect(dropTarget(rows, rows[5].workspace, 3, false)).toBeUndefined();
		expect(dropTarget(rows, rows[5].workspace, 0, true)).toEqual({
			before: 'parent',
			after: 'other'
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
