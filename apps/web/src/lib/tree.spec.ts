import { describe, expect, it } from 'vitest';
import { fileTree, treeRows, type TreeNode } from '@geordi/ui/tree';

const files = (...paths: string[]) => paths.map((path) => ({ path }));
const show = (nodes: TreeNode<{ path: string }>[]): unknown =>
	nodes.map((n) => (n.kind === 'file' ? n.name : { [n.name]: show(n.children) }));

describe('fileTree', () => {
	it('puts directories first, then files, each by name', () => {
		expect(
			show(fileTree(files('b.ts', 'src/z.ts', 'a.ts', 'docs/x.md', 'docs/y.md', 'src/a.ts')))
		).toEqual([{ docs: ['x.md', 'y.md'] }, { src: ['a.ts', 'z.ts'] }, 'a.ts', 'b.ts']);
	});

	it('shows a directory that holds only one directory together with it', () => {
		const tree = fileTree(
			files('apps/web/src/lib/server/a.ts', 'apps/web/src/lib/server/b.ts', 'apps/web/README.md')
		);
		expect(show(tree)).toEqual([
			{ 'apps/web': [{ 'src/lib/server': ['a.ts', 'b.ts'] }, 'README.md'] }
		]);
		const inner = tree[0].kind === 'dir' ? tree[0].children[0] : null;
		expect(inner?.path).toBe('apps/web/src/lib/server');
	});

	it('shows a directory that holds only one file as that file', () => {
		const tree = fileTree(files('.sweet/a.md', 'docs/ref/api/types.md', 'docs/ref/env.md', 'b.ts'));
		expect(show(tree)).toEqual([{ 'docs/ref': ['api/types.md', 'env.md'] }, '.sweet/a.md', 'b.ts']);
		expect(tree[1]).toMatchObject({ kind: 'file', path: '.sweet/a.md' });
	});

	it('keeps the file a row stands for', () => {
		const [node] = fileTree([{ path: 'a.ts', added: 1 }]);
		expect(node).toMatchObject({ kind: 'file', path: 'a.ts', file: { added: 1 } });
	});
});

describe('treeRows', () => {
	const tree = fileTree(files('src/lib/a.ts', 'src/lib/d.ts', 'src/b.ts', 'c.ts'));

	it('lists everything, each at its depth', () => {
		expect(treeRows(tree, new Set()).map((r) => [r.name, r.depth, r.open])).toEqual([
			['src', 0, true],
			['lib', 1, true],
			['a.ts', 2, undefined],
			['d.ts', 2, undefined],
			['b.ts', 1, undefined],
			['c.ts', 0, undefined]
		]);
	});

	it('leaves out what is in a folded directory', () => {
		expect(treeRows(tree, new Set(['src'])).map((r) => [r.name, r.open])).toEqual([
			['src', false],
			['c.ts', undefined]
		]);
	});
});
