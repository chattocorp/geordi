import { describe, expect, it } from 'vitest';
import { byRepository, withAides } from './family.ts';

const workspace = (id: string, repoId: string, parentId: string | null = null) => ({
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

	it('sorts by latest notification, keeping ties and untold workspaces in their given order', () => {
		const all = ['new', 'recent', 'old', 'tie', 'untold'].map((id) => workspace(id, 'one'));
		const times = new Map([
			['recent', 20],
			['old', 10],
			['tie', 10]
		]);
		expect(ids(byRepository(all, times).get('one'))).toEqual([
			'recent',
			'old',
			'tie',
			'new',
			'untold'
		]);
		expect(all.map(({ id }) => id)).toEqual(['new', 'recent', 'old', 'tie', 'untold']);
	});

	it('brings a notified descendant and its family up, sorting siblings too', () => {
		const all = [
			workspace('other', 'one'),
			workspace('sibling', 'one', 'parent'),
			workspace('grandchild', 'one', 'child'),
			workspace('child', 'one', 'parent'),
			workspace('parent', 'one')
		];
		const times = new Map([
			['other', 10],
			['grandchild', 20]
		]);
		expect(ids(byRepository(all, times).get('one'))).toEqual([
			'parent',
			'child',
			'grandchild',
			'sibling',
			'other'
		]);
	});

	it('does not promote a parent in another repository', () => {
		const all = [
			workspace('other', 'one'),
			workspace('parent', 'one'),
			workspace('child', 'two', 'parent')
		];
		expect(ids(byRepository(all, new Map([['child', 20]])).get('one'))).toEqual([
			'other',
			'parent'
		]);
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
