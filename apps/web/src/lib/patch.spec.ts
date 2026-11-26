import { parsePatchFiles } from '@pierre/diffs';
import { describe, expect, it } from 'vitest';
import { describeChange, diffInput, patchFiles } from './patch.ts';

const cwd = '/work';
const modify = `diff --git /work/notes.txt /work/notes.txt\n--- /work/notes.txt\n+++ /work/notes.txt\n@@ -1 +1 @@\n-one\n+two\n`;
const add = `diff --git /work/new.md /work/new.md\nnew file mode 100644\n--- /dev/null\n+++ /work/new.md\n@@ -0,0 +1,2 @@\n+a\n+b\n`;

describe('patchFiles', () => {
	it('gives each file its part of the patch, relative to the worktree', () => {
		const files = patchFiles(
			{
				files: [
					{ operation: 'modify', path: '/work/notes.txt', fileType: 'text' },
					{ operation: 'add', path: '/work/new.md', fileType: 'text' }
				],
				patch: modify + add
			},
			cwd,
			parsePatchFiles
		);
		expect(files.map((f) => [f.path, f.operation, f.diff?.name, f.diff?.type])).toEqual([
			['notes.txt', 'modify', 'notes.txt', 'change'],
			['new.md', 'add', 'new.md', 'new']
		]);
		expect(files[0].diff?.hunks[0].additionLines).toBe(1);
	});

	it('lists changes it cannot draw, and never throws on what an agent sends', () => {
		const moved = { operation: 'move', oldPath: '/work/a.txt', path: '/work/b.txt' };
		const image = { operation: 'add', path: '/elsewhere/logo.png', fileType: 'binary' };
		for (const patch of [undefined, '', 'garbage\n@@ nonsense', '@@ -1,99999999 +1 @@\n-x\n'])
			expect(patchFiles({ files: [moved, image], patch }, cwd, parsePatchFiles)).toEqual([
				{ path: 'b.txt', oldPath: 'a.txt', operation: 'move', binary: false },
				{ path: '/elsewhere/logo.png', operation: 'add', binary: true }
			]);
		const throwing = () => {
			throw new Error('bad patch');
		};
		expect(patchFiles({ files: [moved], patch: modify }, cwd, throwing)).toHaveLength(1);
	});

	it('shows a patch for a file the agent did not list', () => {
		expect(patchFiles({ files: [], patch: modify }, cwd, parsePatchFiles)[0].path).toBe(
			'notes.txt'
		);
	});
});

it('reconstructs whole files only from full context, preserving blank lines and the final newline', () => {
	const patch =
		'diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n first\n \n-old\n+new\n\\ No newline at end of file\n';
	const [file] = parsePatchFiles(patch)[0].files;
	expect(diffInput(file, true)).toEqual({ old: 'first\n\nold\n', new: 'first\n\nnew' });
	expect(diffInput(file)).toEqual({ patch: file });
});

it('says in words what happened to a file it cannot draw', () => {
	expect(describeChange({ path: 'b', oldPath: 'a', operation: 'move', binary: false })).toBe(
		'Moved a to b'
	);
	expect(describeChange({ path: 'logo.png', operation: 'add', binary: true })).toBe(
		'Added logo.png (not a text file)'
	);
});
