import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { folderIn, sortPaths } from './folders.ts';
import type { Worktree } from './worktree.ts';

describe('folderIn', () => {
	const path = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-folders-')));
	const outside = mkdtempSync(join(tmpdir(), 'geordi-outside-'));
	mkdirSync(join(path, 'assets/audio'), { recursive: true });
	mkdirSync(join(path, '.git'));
	writeFileSync(join(path, 'assets/readme.md'), '');
	symlinkSync(outside, join(path, 'elsewhere'));
	const worktree = { path, branch: 'b', adminDir: '', commonDir: '' } satisfies Worktree;

	it('finds directories in the worktree, and the worktree itself', () => {
		expect(folderIn(worktree, 'assets/audio')).toBe(join(path, 'assets/audio'));
		expect(folderIn(worktree, '.')).toBe(path);
	});

	it('refuses files, missing paths, and anything outside the worktree', () => {
		expect(folderIn(worktree, 'assets/readme.md')).toBeNull();
		expect(folderIn(worktree, 'assets/video')).toBeNull();
		expect(folderIn(worktree, 'elsewhere')).toBeNull();
		expect(folderIn(worktree, 'assets/../..')).toBeNull();
		expect(folderIn(worktree, outside)).toBeNull();
		expect(folderIn(worktree, '.git')).toBeNull();
	});

	it('sorts paths into files and directories, leaving out the rest', () => {
		expect(
			sortPaths(worktree, ['assets/readme.md', 'assets/audio', 'assets/video', 'elsewhere'])
		).toEqual({
			files: ['assets/readme.md'],
			folders: ['assets/audio']
		});
	});
});
