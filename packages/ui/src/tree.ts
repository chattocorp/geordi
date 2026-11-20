/** A directory in a file tree, and what is in it: directories first, then files, by name. */
export type TreeDir<F> = { kind: 'dir'; path: string; name: string; children: TreeNode<F>[] };
export type TreeFile<F> = { kind: 'file'; path: string; name: string; file: F };
export type TreeNode<F> = TreeDir<F> | TreeFile<F>;

/** A line of a tree as it is shown: a node, how deep it lies, and (a directory) if it is open. */
export type TreeRow<F> = TreeNode<F> & { depth: number; open?: boolean };

const byName = <F>(a: TreeNode<F>, b: TreeNode<F>) =>
	a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1;

/**
 * Files arranged by their directories. A directory that holds nothing but one other directory
 * is shown together with it, as one (`src/lib/server`), the way VS Code compacts folders.
 */
export function fileTree<F extends { path: string }>(files: readonly F[]): TreeNode<F>[] {
	const root: TreeDir<F> = { kind: 'dir', path: '', name: '', children: [] };

	for (const file of files) {
		const parts = file.path.split('/');
		const name = parts.pop()!;
		let dir = root;
		for (const part of parts) {
			const path = dir.path ? `${dir.path}/${part}` : part;
			let next = dir.children.find((c): c is TreeDir<F> => c.kind === 'dir' && c.name === part);
			if (!next) dir.children.push((next = { kind: 'dir', path, name: part, children: [] }));
			dir = next;
		}
		dir.children.push({ kind: 'file', path: file.path, name, file });
	}

	const compact = (node: TreeNode<F>): TreeNode<F> => {
		if (node.kind === 'file') return node;
		let dir = node;
		while (dir.children.length === 1 && dir.children[0].kind === 'dir') {
			const only = dir.children[0];
			dir = { ...only, name: `${dir.name}/${only.name}` };
		}
		return { ...dir, children: dir.children.map(compact).sort(byName) };
	};
	return root.children.map(compact).sort(byName);
}

/** The rows of a tree that are in view: everything but what is in a folded directory. */
export function treeRows<F>(
	nodes: readonly TreeNode<F>[],
	folded: ReadonlySet<string>,
	depth = 0
): TreeRow<F>[] {
	return nodes.flatMap((node) => {
		if (node.kind === 'file') return [{ ...node, depth }];
		const open = !folded.has(node.path);
		return [{ ...node, depth, open }, ...(open ? treeRows(node.children, folded, depth + 1) : [])];
	});
}
