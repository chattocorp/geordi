import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { FileIndex } from './file-index.ts';
import { createFileSearch } from './file-search.ts';
import { ensureWorktree } from './worktree.ts';

it('ranks across the full index, caps repeated names, and returns original path offsets', () => {
	const index = new FileIndex();
	for (let n = 0; n < 100; n++) index.add(`pkg${n}/MessageComposer.svelte`);
	index.add('final/MsgComp');
	index.add('İmages/Other.svelte');
	const matches = index.search('msgcomp');
	expect(matches).toHaveLength(40);
	expect(matches[0].path).toBe('final/MsgComp');
	expect(matches[39].path).toBe('pkg38/MessageComposer.svelte');
	expect(index.search('pkg99/msgcomp')[0].path).toBe('pkg99/MessageComposer.svelte');
	for (const { path, indices } of matches)
		expect(
			indices
				.map((i) => path[i])
				.join('')
				.toLowerCase()
		).toBe('msgcomp');
	const [across] = index.search('gs/oth');
	expect(across.indices.map((i) => across.path[i]).join('')).toBe('gs/Oth');
	expect(index.search('zzzz')).toEqual([]);
	expect(index.search('')).toHaveLength(40);
});

it('shares an index across queries and rebuilds it from the worktree after invalidation', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'geordi-file-search-'));
	const base = mkdtempSync(join(tmpdir(), 'geordi-file-trees-'));
	const service = createFileSearch();
	try {
		const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args]);
		git('init', '-q');
		writeFileSync(join(repo, '.gitignore'), 'ignored\n');
		writeFileSync(join(repo, 'tracked'), '');
		git('add', '.');
		git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'initial');
		const worktree = await ensureWorktree(base, repo, '12345678');
		unlinkSync(join(worktree.path, 'tracked'));
		writeFileSync(join(worktree.path, 'ignored'), '');
		writeFileSync(join(worktree.path, 'New File'), '');
		const search = (q: string) => service.search('12345678', { worktree }, q);
		const [all, match] = await Promise.all([search(''), search('nfl')]);
		expect(all.map((file) => file.path).sort()).toEqual(['.gitignore', 'New File']);
		expect(match).toEqual([{ path: 'New File', indices: [0, 4, 6] }]);
		writeFileSync(join(worktree.path, 'Another'), '');
		expect(await search('another')).toEqual([]);
		service.invalidate('12345678');
		expect((await search('another'))[0].path).toBe('Another');
		const tree = await service.search('commit', { repoPath: repo, revision: 'HEAD' }, '');
		expect(tree.map((file) => file.path)).toEqual(['.gitignore', 'tracked']);
	} finally {
		service.close();
		rmSync(base, { force: true, recursive: true });
		rmSync(repo, { force: true, recursive: true });
	}
});

it('promotes the next duplicate after a directory or its file disappears', () => {
	const index = new FileIndex();
	for (let i = 0; i < 50; i++) index.add(`dir${i}/src/name.ts`);
	index.reconcile(['dir0', 'dir1/src/name.ts'], new Set());
	index.reconcile(['dir0', 'dir0/new/name.ts'], new Set(['dir0/new/name.ts']));
	const matches = index.search('name.ts');
	expect(matches).toHaveLength(40);
	expect(matches[0].path).toBe('dir2/src/name.ts');
	expect(matches[39].path).toBe('dir41/src/name.ts');
	expect(index.search('dir0/new')[0].path).toBe('dir0/new/name.ts');
});

it('reconciles named paths, moved subtrees, and index-only changes with Git', async () => {
	const root = mkdtempSync(join(tmpdir(), 'geordi-file-deltas-'));
	const repo = join(root, 'repo');
	const service = createFileSearch();
	try {
		mkdirSync(repo);
		const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args]);
		git(repo, 'init', '-q');
		writeFileSync(join(repo, 'tracked'), '');
		writeFileSync(join(repo, '.gitignore'), 'ignored*\n');
		git(repo, 'add', '.');
		git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'Initial');
		const worktree = await ensureWorktree(join(root, 'trees'), repo, '12345678');
		const base = worktree.path;
		const names = async () =>
			(await service.search('test', { worktree }, '')).map((hit) => hit.path).sort();
		const changes = (paths: string[], gitIndex = false) =>
			service.invalidate('test', { paths, gitIndex });
		expect(await names()).toEqual(['.gitignore', 'tracked']);

		writeFileSync(join(base, 'unreported'), '');
		mkdirSync(join(base, 'one/sub'), { recursive: true });
		writeFileSync(join(base, 'one/sub/new [x]'), '');
		writeFileSync(join(base, 'ignored file'), '');
		changes(['one', 'ignored file']);
		expect(await names()).toEqual(['.gitignore', 'one/sub/new [x]', 'tracked']);
		renameSync(join(base, 'one'), join(base, 'two'));
		changes(['one', 'two', 'two/sub']);
		expect(await names()).toEqual(['.gitignore', 'tracked', 'two/sub/new [x]']);

		git(base, 'add', '-f', 'ignored file');
		changes([], true);
		expect(await names()).toContain('ignored file');
		git(base, 'rm', '--cached', 'ignored file');
		changes([], true);
		expect(await names()).not.toContain('ignored file');

		unlinkSync(join(base, 'tracked'));
		mkdirSync(join(base, 'tracked'));
		writeFileSync(join(base, 'tracked', 'child'), '');
		changes(['tracked']);
		expect(await names()).toEqual(['.gitignore', 'tracked/child', 'two/sub/new [x]']);
		rmSync(join(base, 'tracked'), { recursive: true });
		writeFileSync(join(base, 'tracked'), '');
		changes(['tracked']);
		expect(await names()).toEqual(['.gitignore', 'tracked', 'two/sub/new [x]']);
		service.invalidate('test');
		expect(await names()).toContain('unreported');
	} finally {
		service.close();
		rmSync(root, { force: true, recursive: true });
	}
});
