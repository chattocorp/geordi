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
