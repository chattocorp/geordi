import { execFileSync } from 'node:child_process';
import {
	existsSync,
	readFileSync,
	readdirSync,
	mkdirSync,
	mkdtempSync,
	renameSync,
	rmSync,
	writeFileSync,
	utimesSync,
	unlinkSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { addFileScope, FileIndex } from './file-index.ts';
import { checkpointName, pruneFileCheckpoints } from './file-index-cache.ts';
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

it('removes a file replaced by a directory when only its new child is reported', () => {
	const index = new FileIndex();
	index.add('src/entry');
	index.reconcile(['src/entry/child'], new Set(['src/entry/child']));
	expect(index.search('entry').map((hit) => hit.path)).toEqual(['src/entry/child']);
	index.reconcile(['src/entry'], new Set(['src/entry/child']));
	expect(index.search('entry').map((hit) => hit.path)).toEqual(['src/entry/child']);
	expect(index.checkpointPaths()).toEqual(['src/entry/child']);
});

it('bounds a burst of file events without losing unrelated paths in the same batch', () => {
	const scopes = new Set(['src/visible']);
	for (let i = 0; i < 2048; i++) {
		expect(addFileScope(scopes, `out/pkg${i}/generated`)).toBe(true);
	}
	expect(scopes.has('out')).toBe(true);
	expect(scopes.has('src/visible')).toBe(true);
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
		const external = join(root, 'excludes');
		git(repo, 'config', 'core.excludesFile', external);
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
		// Overflow the old event limit while an unrelated unreported path is present.
		// A full rebuild would accidentally discover it.
		mkdirSync(join(base, 'ignored-output'));
		const burst = Array.from({ length: 180 }, (_, i) => `ignored-output/${i}.js`);
		for (const path of burst) writeFileSync(join(base, path), '');
		changes([...burst, 'one', 'ignored file']);
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
		changes(['tracked/child']);
		expect(await names()).toEqual(['.gitignore', 'tracked/child', 'two/sub/new [x]']);
		rmSync(join(base, 'tracked'), { recursive: true });
		writeFileSync(join(base, 'tracked'), '');
		changes(['tracked']);
		expect(await names()).toEqual(['.gitignore', 'tracked', 'two/sub/new [x]']);
		service.invalidate('test');
		expect(await names()).toContain('unreported');
		writeFileSync(external, 'unreported\n');
		expect(await names()).not.toContain('unreported');
		unlinkSync(external);
		expect(await names()).toContain('unreported');
	} finally {
		service.close();
		rmSync(root, { force: true, recursive: true });
	}
});

it('catches up a saved worktree across worker restarts and replaces a damaged checkpoint', async () => {
	const root = mkdtempSync(join(tmpdir(), 'geordi-file-checkpoint-'));
	const repo = join(root, 'repo');
	const cache = join(root, 'cache');
	let service = createFileSearch(cache);
	function restart() {
		service.close();
		service = createFileSearch(cache);
	}
	try {
		mkdirSync(repo);
		const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args]);
		git(repo, 'init', '-q');
		writeFileSync(join(repo, 'tracked'), '');
		writeFileSync(join(repo, '.gitignore'), 'forced\n');
		git(repo, 'add', '.');
		git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'Initial');
		const tree = await ensureWorktree(join(root, 'trees'), repo, '12345678');
		const names = async () =>
			(await service.search('test', { worktree: tree }, '')).map((hit) => hit.path).sort();
		writeFileSync(join(tree.path, 'old'), '');
		writeFileSync(join(tree.path, 'forced'), '');
		expect(await names()).toEqual(['.gitignore', 'old', 'tracked']);
		const checkpoint = checkpointName(cache, tree.path);
		expect(existsSync(checkpoint)).toBe(process.platform === 'darwin');
		const original = existsSync(checkpoint) ? readFileSync(checkpoint) : undefined;

		restart();
		expect(await names()).toEqual(['.gitignore', 'old', 'tracked']);
		if (original) expect(readFileSync(checkpoint)).toEqual(original);
		restart();
		renameSync(join(tree.path, 'old'), join(tree.path, 'new'));
		unlinkSync(join(tree.path, 'tracked'));
		writeFileSync(join(tree.path, 'added'), '');
		git(tree.path, 'add', '-f', 'forced');
		expect(await names()).toEqual(['.gitignore', 'added', 'forced', 'new']);

		restart();
		writeFileSync(join(tree.commonDir, 'info/exclude'), 'added\n');
		expect(await names()).toEqual(['.gitignore', 'forced', 'new']);
		restart();
		if (original) writeFileSync(checkpoint, 'truncated');
		writeFileSync(join(tree.path, 'recovered'), '');
		expect(await names()).toEqual(['.gitignore', 'forced', 'new', 'recovered']);
		if (original) expect(readFileSync(checkpoint).length).toBeGreaterThan(32);
		await service.discard('test', tree.path);
		expect(existsSync(checkpoint)).toBe(false);
	} finally {
		service.close();
		rmSync(root, { recursive: true, force: true });
	}
});

it('prunes old unused file indexes and retains recently read indexes', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'geordi-prune-indexes-'));
	try {
		const stale = checkpointName(dir, 'removed tree');
		const active = checkpointName(dir, 'active tree');
		const old = new Date(0);
		writeFileSync(stale, '');
		writeFileSync(active, '');
		utimesSync(stale, old, old);
		utimesSync(active, new Date(), old);
		await pruneFileCheckpoints(dir);
		expect(readdirSync(dir)).toHaveLength(1);
		expect(readFileSync(active, 'utf8')).toBe('');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
