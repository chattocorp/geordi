import { execFileSync } from 'node:child_process';
import { NO_WORKTREE } from '@geordi/protocol';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changes, readText, status, uncommittedFiles, versions } from './changes.ts';
import { startTurnDiff } from './turn-diff.ts';
import { removeWorktree } from './remove.ts';
import {
	branchOf,
	branchRef,
	continueOn,
	ensureWorktree,
	fetchUpstream,
	locateWorktree,
	startOf,
	upstreamBranchOf
} from './worktree.ts';

function repo() {
	const path = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-wt-')));
	const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args]);
	git('init', '-q');
	git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
	return path;
}

describe('ensureWorktree', () => {
	it('creates a worktree on a new branch, idempotently', async () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const first = await ensureWorktree(base, repoPath, '12345678-aaaa');
		const second = await ensureWorktree(base, repoPath, '12345678-aaaa');

		expect(first).toMatchObject({ created: true, branch: 'geordi/12345678' });
		expect(second).toMatchObject({ created: false, path: first.path });
	});

	it('starts from where the upstream stands now, not from what is checked out', async () => {
		// an upstream, a clone of it, and work that reached the upstream since
		const upstream = repo();
		const git = (cwd: string, ...args: string[]) =>
			execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
				encoding: 'utf8'
			}).trim();
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-clone-')));
		execFileSync('git', ['clone', '-q', upstream, repoPath]);
		git(upstream, 'commit', '-q', '--allow-empty', '-m', 'landed upstream');
		git(repoPath, 'commit', '-q', '--allow-empty', '-m', 'local only');

		expect(await fetchUpstream(repoPath)).toBeNull();
		expect(await startOf(repoPath)).toMatch(/^refs\/remotes\/origin\//);

		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, '12345678-aaaa');
		expect(git(worktree.path, 'rev-parse', 'HEAD')).toBe(git(upstream, 'rev-parse', 'HEAD'));
		// a branch of its own: nothing it would push to by default
		expect(() => git(worktree.path, 'rev-parse', '--abbrev-ref', '@{upstream}')).toThrow();
		expect(await changes(worktree, { repoPath })).toEqual([]);
	});

	it('starts from what is checked out where there is no upstream, or no reaching it', async () => {
		const repoPath = repo();
		expect(await fetchUpstream(repoPath)).toBeNull();
		expect(await startOf(repoPath)).toBe('HEAD');

		execFileSync('git', ['-C', repoPath, 'remote', 'add', 'origin', '/no/such/upstream']);
		expect(await fetchUpstream(repoPath)).toEqual(expect.any(String));
		expect(await startOf(repoPath)).toBe('HEAD');
	});

	it('brings a worktree that was removed back from its branch, with what was committed', async () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const { path } = await ensureWorktree(base, repoPath, '12345678-aaaa');
		const git = (...args: string[]) =>
			execFileSync('git', ['-C', path, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
		writeFileSync(join(path, 'committed.txt'), 'kept\n');
		git('add', '.');
		git('commit', '-qm', 'work');
		writeFileSync(join(path, 'uncommitted.txt'), 'lost\n');

		rmSync(path, { recursive: true }); // someone tidied up behind Geordi's back
		await expect(locateWorktree(base, repoPath, '12345678-aaaa')).rejects.toThrow(NO_WORKTREE);

		const again = await ensureWorktree(base, repoPath, '12345678-aaaa');
		expect(again).toMatchObject({ path, created: false, restored: true });
		expect(readFileSync(join(path, 'committed.txt'), 'utf8')).toBe('kept\n');
		expect(existsSync(join(path, 'uncommitted.txt'))).toBe(false);
		expect(await ensureWorktree(base, repoPath, '12345678-aaaa')).toMatchObject({
			restored: false
		});

		// with its branch gone too, there is nothing to bring back: it starts afresh
		rmSync(path, { recursive: true });
		execFileSync('git', ['-C', repoPath, 'worktree', 'prune']);
		execFileSync('git', ['-C', repoPath, 'branch', '-qD', 'geordi/12345678']);
		await expect(
			ensureWorktree(base, repoPath, '12345678-aaaa', undefined, 'geordi/12345678', true)
		).rejects.toThrow('The local branch geordi/12345678 is missing');
		expect(existsSync(path)).toBe(false);
		expect(await ensureWorktree(base, repoPath, '12345678-aaaa')).toMatchObject({
			created: true,
			restored: false
		});
		expect(existsSync(join(path, 'committed.txt'))).toBe(false);
	});

	it('reports a branch the agent renamed, and comes back from it', async () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, '12345678-aaaa');
		const git = (...args: string[]) =>
			execFileSync('git', [
				'-C',
				worktree.path,
				'-c',
				'user.name=t',
				'-c',
				'user.email=t@t',
				...args
			]);
		git('branch', '-m', 'geordi/fix-login');
		writeFileSync(join(worktree.path, 'committed.txt'), 'kept\n');
		git('add', '.');
		git('commit', '-qm', 'work');
		expect(branchOf(worktree)).toBe('geordi/fix-login');
		expect(await status(worktree, { repoPath })).toMatchObject({ branch: 'geordi/fix-login' });

		await removeWorktree(base, repoPath, '12345678-aaaa', false);
		const again = await ensureWorktree(
			base,
			repoPath,
			'12345678-aaaa',
			undefined,
			'geordi/fix-login'
		);
		expect(again).toMatchObject({ restored: true, branch: 'geordi/fix-login' });
		expect(readFileSync(join(worktree.path, 'committed.txt'), 'utf8')).toBe('kept\n');
	});

	it('knows a branch by the name it was pushed under', async () => {
		// an upstream, and a clone of it in which a workspace's branch was pushed under another name
		const upstream = repo();
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-clone-')));
		execFileSync('git', ['clone', '-q', upstream, repoPath]);
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, '12345678-aaaa');
		const git = (...args: string[]) =>
			execFileSync('git', [
				'-C',
				worktree.path,
				'-c',
				'user.name=t',
				'-c',
				'user.email=t@t',
				...args
			]);
		expect(await upstreamBranchOf(repoPath, worktree.branch)).toBe('geordi/12345678');
		expect((await status(worktree, { repoPath })).unpushed).toBeNull();

		git('commit', '-q', '--allow-empty', '-m', 'work');
		git('push', '-q', '-u', 'origin', 'HEAD:a-better-name');
		expect(await upstreamBranchOf(repoPath, worktree.branch)).toBe('a-better-name');
		expect((await status(worktree, { repoPath })).unpushed).toBe(0);
		git('commit', '-q', '--allow-empty', '-m', 'more work');
		expect((await status(worktree, { repoPath })).unpushed).toBe(1);

		// merely set to follow the main branch, it has no place of its own upstream
		const main = execFileSync('git', ['-C', upstream, 'branch', '--show-current'], {
			encoding: 'utf8'
		}).trim();
		git('branch', '-q', `--set-upstream-to=origin/${main}`);
		expect(await upstreamBranchOf(repoPath, worktree.branch)).toBe('geordi/12345678');
	});

	it('carries on, on a new branch off where the upstream stands, and keeps the old one', async () => {
		const upstream = repo();
		const run = (cwd: string, ...args: string[]) =>
			execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
				encoding: 'utf8'
			}).trim();
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-clone-')));
		execFileSync('git', ['clone', '-q', upstream, repoPath]);
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, '12345678-aaaa');

		// work in the workspace, and meanwhile something else lands upstream
		writeFileSync(join(worktree.path, 'mine.txt'), 'mine\n');
		run(worktree.path, 'add', '.');
		run(worktree.path, 'commit', '-qm', 'my work');
		writeFileSync(join(upstream, 'landed.txt'), 'landed\n');
		run(upstream, 'add', '.');
		run(upstream, 'commit', '-qm', 'landed upstream');
		await fetchUpstream(repoPath);

		expect(await continueOn(worktree, repoPath)).toBe('geordi/12345678-2');
		// on the new branch, with the upstream's files and none of its own old ones
		expect(run(worktree.path, 'branch', '--show-current')).toBe('geordi/12345678-2');
		expect(run(worktree.path, 'rev-parse', 'HEAD')).toBe(run(upstream, 'rev-parse', 'HEAD'));
		expect(existsSync(join(worktree.path, 'landed.txt'))).toBe(true);
		expect(existsSync(join(worktree.path, 'mine.txt'))).toBe(false);
		expect(run(worktree.path, 'status', '--porcelain')).toBe('');
		expect(await changes(worktree, { repoPath })).toEqual([]);
		// what was done before is still on its branch
		expect(run(repoPath, 'log', '--format=%s', '-1', 'geordi/12345678')).toBe('my work');

		// a HEAD the agent turned into a link is replaced, not written through
		const elsewhere = join(base, 'not-the-agents-to-write.txt');
		writeFileSync(elsewhere, 'precious\n');
		rmSync(join(worktree.adminDir, 'HEAD'));
		symlinkSync(elsewhere, join(worktree.adminDir, 'HEAD'));
		writeFileSync(elsewhere, 'ref: refs/heads/geordi/12345678-2\n'); // what git would read through it
		await continueOn(worktree, repoPath);
		expect(readFileSync(elsewhere, 'utf8')).toBe('ref: refs/heads/geordi/12345678-2\n');
		expect(lstatSync(join(worktree.adminDir, 'HEAD')).isSymbolicLink()).toBe(false);

		// and a worktree that goes missing comes back on the branch it was on
		expect(run(worktree.path, 'branch', '--show-current')).toBe('geordi/12345678-3');
		rmSync(worktree.path, { recursive: true });
		const back = await ensureWorktree(
			base,
			repoPath,
			'12345678-aaaa',
			undefined,
			'geordi/12345678-3'
		);
		expect(back).toMatchObject({ restored: true, branch: 'geordi/12345678-3' });
		expect(run(back.path, 'branch', '--show-current')).toBe('geordi/12345678-3');
	});

	it('refuses a worktree whose Git metadata was repointed', async () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const { path, writableRoots } = await ensureWorktree(base, repoPath, '12345678-aaaa');
		const evil = mkdtempSync(join(tmpdir(), 'geordi-evil-'));

		const commondir = join(writableRoots.at(-1)!, 'commondir');
		writeFileSync(commondir, evil);
		await expect(ensureWorktree(base, repoPath, '12345678-aaaa')).rejects.toThrow(/was modified/);

		writeFileSync(commondir, '../..');
		await expect(ensureWorktree(base, repoPath, '12345678-aaaa')).resolves.toBeDefined();

		writeFileSync(join(path, '.git'), `gitdir: ${evil}`);
		await expect(ensureWorktree(base, repoPath, '12345678-aaaa')).rejects.toThrow(/was modified/);
	});

	it('locates only worktrees that exist', async () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		await expect(locateWorktree(base, repoPath, '12345678-aaaa')).rejects.toThrow(/no worktree/);
		const { path } = await ensureWorktree(base, repoPath, '12345678-aaaa');
		expect((await locateWorktree(base, repoPath, '12345678-aaaa')).path).toBe(path);
	});

	it('never makes hooks or config writable', async () => {
		const { writableRoots } = await ensureWorktree(
			realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-'))),
			repo(),
			'abcdefgh-1'
		);
		const gitDir = writableRoots[0].replace(/\/objects$/, '');
		expect(writableRoots).toEqual([
			`${gitDir}/objects`,
			`${gitDir}/refs`,
			`${gitDir}/logs`,
			`${gitDir}/worktrees/abcdefgh`
		]);
	});
});

describe('changes', () => {
	it('reports committed, uncommitted and untracked changes against the fork point', async () => {
		const repoPath = repo();
		writeFileSync(join(repoPath, 'kept.txt'), 'one\ntwo\n');
		execFileSync('git', ['-C', repoPath, 'add', '.']);
		execFileSync('git', [
			'-C',
			repoPath,
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t',
			'commit',
			'-qm',
			'base'
		]);

		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');
		expect(await changes(worktree, { repoPath })).toEqual([]);

		// committed in the workspace
		writeFileSync(join(worktree.path, 'committed.txt'), 'a\n');
		const git = (...args: string[]) => execFileSync('git', ['-C', worktree.path, ...args]);
		git('add', '.');
		git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'work');
		// uncommitted, and untracked
		writeFileSync(join(worktree.path, 'kept.txt'), 'one\nTWO\nthree\n');
		writeFileSync(join(worktree.path, 'new.txt'), 'x\ny\n');

		expect(await changes(worktree, { repoPath })).toEqual([
			{ path: 'committed.txt', status: 'added', added: 1, removed: 0 },
			{ path: 'kept.txt', status: 'modified', added: 2, removed: 1 },
			{ path: 'new.txt', status: 'added', added: 2, removed: 0 }
		]);
		const origin = { repoPath };
		expect(await versions(worktree, origin, 'kept.txt')).toEqual({
			old: 'one\ntwo\n',
			new: 'one\nTWO\nthree\n'
		});
		expect(await versions(worktree, origin, 'new.txt')).toEqual({ old: null, new: 'x\ny\n' });
		expect(await versions(worktree, origin, 'committed.txt')).toEqual({ old: null, new: 'a\n' });

		// deleted, and binary
		rmSync(join(worktree.path, 'kept.txt'));
		writeFileSync(join(worktree.path, 'blob.bin'), Buffer.from([1, 0, 2]));
		expect(await versions(worktree, origin, 'kept.txt')).toEqual({ old: 'one\ntwo\n', new: null });
		expect(await versions(worktree, origin, 'blob.bin')).toEqual({
			unavailable: expect.stringMatching(/binary/)
		});
		const kept = async () =>
			(await changes(worktree, origin)).filter((file) => /kept/.test(file.path));
		expect(await kept()).toEqual([{ path: 'kept.txt', status: 'deleted', added: 0, removed: 2 }]);

		// moved: one change, not a deletion and an addition, and its old version is the old file's
		writeFileSync(join(worktree.path, 'kept.txt'), 'one\ntwo\n');
		git('mv', 'kept.txt', 'kept elsewhere.txt');
		expect(await kept()).toEqual([
			{ path: 'kept elsewhere.txt', status: 'renamed', from: 'kept.txt', added: 0, removed: 0 }
		]);
		expect(await versions(worktree, origin, 'kept elsewhere.txt')).toEqual({
			old: 'one\ntwo\n',
			new: 'one\ntwo\n'
		});
	});

	it('only shows files that changed, never what a path or a symlink leads to', async () => {
		const repoPath = repo();
		mkdirSync(join(repoPath, 'sub'));
		writeFileSync(join(repoPath, 'sub', 'secret.txt'), 'ours');
		execFileSync('git', ['-C', repoPath, 'add', '.']);
		execFileSync('git', [
			'-C',
			repoPath,
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t',
			'commit',
			'-qm',
			'sub'
		]);
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');
		const secret = join(base, 'secret.txt');
		writeFileSync(secret, 'do not show');
		symlinkSync(base, join(worktree.path, 'elsewhere'));
		symlinkSync(secret, join(worktree.path, 'link.txt'));

		expect(readText(worktree, 'sub/secret.txt')).toBe('ours');
		for (const path of [
			'../../secret.txt',
			secret,
			'.git',
			'link.txt',
			'elsewhere/secret.txt',
			'missing.txt'
		])
			expect(readText(worktree, path)).toBeNull();

		const none = { unavailable: expect.stringMatching(/no changes/) };
		const origin = { repoPath };
		expect(await versions(worktree, origin, '../secret.txt')).toEqual(none);
		expect(await versions(worktree, origin, secret)).toEqual(none);
		expect(await versions(worktree, origin, 'elsewhere/secret.txt')).toEqual(none);
		expect(await versions(worktree, origin, 'README.md')).toEqual(none);
		// a named pipe must not make us wait for a writer that never comes
		execFileSync('mkfifo', [join(worktree.path, 'pipe')]);
		expect(readText(worktree, 'pipe')).toBeNull();
		rmSync(join(worktree.path, 'pipe'));

		// a tracked file whose directory was swapped for a link to somewhere else: git reports
		// the file as changed (deleted), while the path now leads out of the worktree
		rmSync(join(worktree.path, 'sub'), { recursive: true });
		symlinkSync(base, join(worktree.path, 'sub'));
		expect((await changes(worktree, origin)).map((file) => file.path)).toContain('sub/secret.txt');
		expect(JSON.stringify(await versions(worktree, origin, 'sub/secret.txt'))).not.toContain(
			'do not show'
		);

		// the link itself changed (it is new), but what it points to is not ours to show
		expect(await versions(worktree, origin, 'link.txt')).toEqual({
			unavailable: expect.stringMatching(/not a regular file/)
		});
	});

	it('branches sub-workspaces off their parent and measures changes against it', async () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const parent = await ensureWorktree(base, repoPath, 'parent00-1');
		const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args]);
		writeFileSync(join(parent.path, 'parent.txt'), 'p\n');
		git(parent.path, 'add', '.');
		git(parent.path, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'parent');

		const child = await ensureWorktree(base, repoPath, 'child000-1', parent.branch);
		expect(existsSync(join(child.path, 'parent.txt'))).toBe(true);
		writeFileSync(join(child.path, 'child.txt'), 'c\n');

		// against the parent: only the child's own work; against the repository: both
		const origin = { repoPath, base: parent.branch };
		expect((await changes(child, origin)).map((file) => file.path)).toEqual(['child.txt']);
		expect((await changes(child, { repoPath })).map((file) => file.path)).toEqual([
			'child.txt',
			'parent.txt'
		]);
		await expect(ensureWorktree(base, repoPath, 'evil0000-1', '--detach')).rejects.toThrow(
			/branch name/
		);
	});

	it('inherits the target through clean parents and follows a retargeted pull request', async () => {
		const repoPath = repo();
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const git = (cwd: string, ...args: string[]) =>
			execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
		const parent = await ensureWorktree(root, repoPath, 'parent00-1');
		const child = await ensureWorktree(root, repoPath, 'child000-1', parent.branch);
		git(repoPath, 'update-ref', 'refs/remotes/origin/release', 'HEAD');
		writeFileSync(join(repoPath, 'from-main.txt'), 'upstream\n');
		git(repoPath, 'add', '.');
		git(repoPath, 'commit', '-qm', 'upstream work');
		git(repoPath, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
		git(repoPath, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
		git(child.path, 'merge', '--ff-only', 'origin/main');
		writeFileSync(join(child.path, 'child.txt'), 'local\n');

		const origin = { repoPath, base: parent.branch };
		expect(await status(child, origin)).toMatchObject({
			comparisonTarget: 'main',
			files: [{ path: 'child.txt' }],
			uncommitted: 1
		});
		const release = { ...origin, pullBase: 'release' };
		expect(await status(child, release)).toMatchObject({
			comparisonTarget: 'release',
			files: [{ path: 'child.txt' }, { path: 'from-main.txt' }]
		});
		expect(await versions(child, release, 'from-main.txt')).toEqual({
			old: null,
			new: 'upstream\n'
		});
		expect(await versions(child, origin, 'from-main.txt')).toHaveProperty('unavailable');
		expect(
			await status(child, { ...origin, parents: [{ branch: parent.branch, pullBase: 'release' }] })
		).toMatchObject({ comparisonTarget: 'release' });
	});

	it("ignores config an agent plants in the worktree's admin directory", async () => {
		const repoPath = repo();
		execFileSync('git', ['-C', repoPath, 'config', 'extensions.worktreeConfig', 'true']);
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');

		const marker = join(base, 'pwned');
		writeFileSync(
			join(worktree.adminDir, 'config.worktree'),
			`[core]\n\tfsmonitor = "touch ${marker}; false"\n`
		);
		writeFileSync(join(worktree.path, 'new.txt'), 'x\n');

		expect(await changes(worktree, { repoPath })).toEqual([
			{ path: 'new.txt', status: 'added', added: 1, removed: 0 }
		]);
		expect(existsSync(marker)).toBe(false);
	});

	it('never runs git inside a submodule an agent planted', async () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');

		// a nested repository with hostile config, staged as a submodule and then dirtied
		const nested = join(worktree.path, 'nested');
		const marker = join(base, 'pwned');
		const git = (cwd: string, ...args: string[]) =>
			execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
		execFileSync('git', ['init', '-q', nested]);
		git(nested, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'x');
		git(worktree.path, 'add', 'nested');
		git(nested, 'config', 'core.fsmonitor', `touch ${marker}; false`);
		writeFileSync(join(nested, 'dirty.txt'), 'x\n');

		await changes(worktree, { repoPath });
		expect(existsSync(marker)).toBe(false);
	});
});

describe('status', () => {
	it('detects fetched base commits and clears them after a merge', async () => {
		const upstream = repo();
		const git = (cwd: string, ...args: string[]) =>
			execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
				encoding: 'utf8'
			}).trim();
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-clone-')));
		git(upstream, 'clone', '-q', upstream, repoPath);
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, 'incoming-1');
		const origin = { repoPath };
		const branch = await startOf(repoPath);
		expect((await status(worktree, origin)).incoming).toEqual({ branch, commits: 0 });
		git(worktree.path, 'commit', '-qm', 'workspace work', '--allow-empty');
		git(upstream, 'commit', '-qm', 'upstream work', '--allow-empty');
		expect((await status(worktree, origin)).incoming?.commits).toBe(0);
		await fetchUpstream(repoPath);
		expect((await status(worktree, origin)).incoming).toEqual({ branch, commits: 1 });
		git(worktree.path, 'merge', '-qm', 'Merge upstream', branch);
		expect((await status(worktree, origin)).incoming?.commits).toBe(0);
	});

	it('compares child workspaces with their parent branch', async () => {
		const { repoPath, base, worktree, git } = await workspace();
		const child = await ensureWorktree(base, repoPath, 'child-1', worktree.branch);
		git('commit', '-qm', 'parent work', '--allow-empty');
		expect((await status(child, { repoPath, base: worktree.branch })).incoming).toEqual({
			branch: branchRef(worktree.branch),
			commits: 1
		});
	});

	async function workspace() {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');
		const git = (...args: string[]) =>
			execFileSync('git', [
				'-C',
				worktree.path,
				'-c',
				'user.name=t',
				'-c',
				'user.email=t@t',
				...args
			]);
		return { repoPath, base, worktree, git, origin: { repoPath } };
	}

	it('knows when all a branch did is in the branch it started from', async () => {
		const { repoPath, worktree, git, origin } = await workspace();
		writeFileSync(join(worktree.path, 'a.txt'), 'a\n');
		git('add', 'a.txt');
		git('commit', '-q', '-m', 'Add a');
		expect(await status(worktree, origin)).toMatchObject({
			landed: false,
			files: [{ path: 'a.txt' }]
		});

		// merged where it came from (as the agent that started this one does)
		execFileSync('git', ['-C', repoPath, 'merge', '-q', '--ff-only', worktree.branch]);
		expect(await status(worktree, origin)).toMatchObject({
			landed: true,
			files: [],
			uncommitted: 0
		});
	});

	it('does not take a branch only brought up to date with its base for one that landed', async () => {
		const { repoPath, worktree, git, origin } = await workspace();
		execFileSync('git', [
			'-C',
			repoPath,
			'-c',
			'user.name=t',
			'-c',
			'user.email=t@t',
			'commit',
			'-q',
			'--allow-empty',
			'-m',
			'more on main'
		]);
		const main = execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD']).toString().trim();
		git('merge', '-q', '--ff-only', main);
		expect(await status(worktree, origin)).toMatchObject({ landed: false, files: [] });
	});

	it('does not take a renamed branch for one that landed', async () => {
		const { worktree, git, origin } = await workspace();
		git('branch', '-m', 'geordi/renamed');
		expect(await status(worktree, origin)).toMatchObject({ landed: false, files: [] });
	});

	it('tells uncommitted from committed from pushed', async () => {
		const { repoPath, worktree, git, origin } = await workspace();
		expect(await status(worktree, origin)).toMatchObject({
			files: [],
			uncommitted: 0,
			unpushed: null,
			landed: false
		});

		writeFileSync(join(worktree.path, 'a.txt'), 'a\n');
		writeFileSync(join(worktree.path, 'b.txt'), 'b\n');
		expect(await status(worktree, origin)).toMatchObject({ uncommitted: 2, unpushed: null });

		git('add', 'a.txt');
		git('commit', '-qm', 'a');
		writeFileSync(join(worktree.path, 'a.txt'), 'staged edit\n');
		git('add', 'a.txt');
		writeFileSync(join(worktree.path, 'a.txt'), 'a\n');
		expect(await status(worktree, origin)).toMatchObject({
			uncommitted: 2,
			uncommittedPaths: ['a.txt', 'b.txt'],
			unpushed: null
		});
		git('restore', '--staged', 'a.txt');
		expect(await status(worktree, origin)).toMatchObject({
			uncommitted: 1,
			uncommittedPaths: ['b.txt'],
			unpushed: null
		});

		// pushed, as far as this machine knows: the remote-tracking branch is where we are
		const remote = 'refs/remotes/origin/geordi/abcdefgh';
		execFileSync('git', ['-C', repoPath, 'update-ref', remote, 'refs/heads/geordi/abcdefgh']);
		expect(await status(worktree, origin)).toMatchObject({ uncommitted: 1, unpushed: 0 });

		git('add', '.');
		git('commit', '-qm', 'b');
		expect(await status(worktree, origin)).toMatchObject({ uncommitted: 0, unpushed: 1 });
		expect((await status(worktree, origin)).files).toHaveLength(2);
	});

	it('removes a clean worktree, keeps its branch, and refuses to discard work unless told to', async () => {
		const { repoPath, base, worktree, git } = await workspace();
		writeFileSync(join(worktree.path, 'a.txt'), 'a\n');
		await expect(removeWorktree(base, repoPath, 'abcdefgh-1', false)).rejects.toThrow(
			/uncommitted or untracked/
		);
		expect(existsSync(worktree.path)).toBe(true);

		git('add', '.');
		git('commit', '-qm', 'a');
		await removeWorktree(base, repoPath, 'abcdefgh-1', false);
		expect(existsSync(worktree.path)).toBe(false);
		const branches = execFileSync('git', ['-C', repoPath, 'branch', '--list', 'geordi/*']);
		expect(String(branches)).toContain('geordi/abcdefgh');

		// git has forgotten it too
		const listed = execFileSync('git', ['-C', repoPath, 'worktree', 'list']);
		expect(String(listed)).not.toContain('abcdefgh');

		// already gone is fine; and force discards
		await removeWorktree(base, repoPath, 'abcdefgh-1', false);
		const second = await ensureWorktree(base, repoPath, 'second00-1');
		writeFileSync(join(second.path, 'junk.txt'), 'x\n');
		await removeWorktree(base, repoPath, 'second00-1', true);
		expect(existsSync(second.path)).toBe(false);
	});

	it('never runs git on a worktree whose metadata an agent rewired', async () => {
		const { repoPath, base, worktree } = await workspace();
		const evil = mkdtempSync(join(tmpdir(), 'geordi-evil-'));
		const marker = join(base, 'pwned');
		// a fake Git directory with a hostile config, and the worktree pointed at it
		execFileSync('git', ['init', '-q', evil]);
		execFileSync('git', ['-C', evil, 'config', 'core.fsmonitor', `touch ${marker}; false`]);
		writeFileSync(join(worktree.path, '.git'), `gitdir: ${join(evil, '.git')}`);

		await expect(removeWorktree(base, repoPath, 'abcdefgh-1', false)).rejects.toThrow(
			/was modified/
		);
		expect(existsSync(worktree.path)).toBe(true);
		await removeWorktree(base, repoPath, 'abcdefgh-1', true);
		expect(existsSync(worktree.path)).toBe(false);
		expect(existsSync(marker)).toBe(false);
	});
});

describe('branch names', () => {
	it('accepts what git accepts', () => {
		for (const name of ['main', 'fix/issue#12', 'release@2', 'c++-port', 'feature/grüße', 'a.b'])
			expect(branchRef(name)).toBe(`refs/heads/${name}`);
	});

	it('refuses what could be read as an option or a revision expression', () => {
		for (const name of [
			'-x',
			'--upload-pack=x',
			'a..b',
			'a b',
			'a~1',
			'a^',
			'a:b',
			'x@{1}',
			'.hidden',
			'a/',
			'a//b',
			'a.lock',
			'a/.b',
			''
		])
			expect(() => branchRef(name), name).toThrow('Not a branch name');
	});
});

describe('Continue checkout', () => {
	const file = 'local settings.txt';

	async function setup({ ignored = false } = {}) {
		const repoPath = repo();
		const run = (cwd: string, ...args: string[]) =>
			execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
				encoding: 'utf8'
			}).trim();
		if (ignored) {
			writeFileSync(join(repoPath, '.gitignore'), file + '\n');
			run(repoPath, 'add', '.gitignore');
			run(repoPath, 'commit', '-qm', 'ignore local settings');
		}
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');
		writeFileSync(join(repoPath, file), 'from the target\n');
		run(repoPath, 'add', '-f', file);
		run(repoPath, 'commit', '-qm', 'track settings on the target');
		return { worktree, repoPath, run, local: join(worktree.path, file) };
	}

	it('keeps an untracked file written after the clean check and rolls back the new branch', async () => {
		const { worktree, repoPath, run, local } = await setup();
		const head = run(worktree.path, 'rev-parse', 'HEAD');
		const index = run(worktree.path, 'write-tree');
		expect(await uncommittedFiles(worktree)).toEqual([]);
		writeFileSync(local, 'written during Continue\n');

		await expect(continueOn(worktree, repoPath)).rejects.toThrow(file);
		expect(readFileSync(local, 'utf8')).toBe('written during Continue\n');
		expect(branchOf(worktree)).toBe(worktree.branch);
		expect(run(worktree.path, 'rev-parse', 'HEAD')).toBe(head);
		expect(run(worktree.path, 'write-tree')).toBe(index);
		expect(run(repoPath, 'branch', '--list', worktree.branch + '-2')).toBe('');
	});

	it('replaces an ignored file with the version tracked on the new branch', async () => {
		const { worktree, repoPath, run, local } = await setup({ ignored: true });
		writeFileSync(local, 'ignored local settings\n');
		expect(run(worktree.path, 'check-ignore', '--', file)).toBe(file);
		expect(await uncommittedFiles(worktree)).toEqual([]);

		const branch = await continueOn(worktree, repoPath);
		expect(branchOf(worktree)).toBe(branch);
		expect(readFileSync(local, 'utf8')).toBe('from the target\n');
		expect(run(worktree.path, 'show', ':' + file)).toBe('from the target');
		expect(run(worktree.path, 'status', '--porcelain')).toBe('');
	});
});

it('carries uncommitted changes onto the new branch, or moves nothing where they do not fit', async () => {
	const repoPath = repo();
	const run = (cwd: string, ...args: string[]) =>
		execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
			encoding: 'utf8'
		}).trim();
	writeFileSync(join(repoPath, 'shared.txt'), 'as it started\n');
	run(repoPath, 'add', '.');
	run(repoPath, 'commit', '-qm', 'a file to change');
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
	const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');

	// work begun after the branch landed: an edit, and a new file
	writeFileSync(join(worktree.path, 'shared.txt'), 'edited since\n');
	writeFileSync(join(worktree.path, 'new.txt'), 'new\n');
	const branch = await continueOn(worktree, repoPath);
	expect(branchOf(worktree)).toBe(branch);
	expect(readFileSync(join(worktree.path, 'shared.txt'), 'utf8')).toBe('edited since\n');
	expect(readFileSync(join(worktree.path, 'new.txt'), 'utf8')).toBe('new\n');
	expect((await uncommittedFiles(worktree)).sort()).toEqual(['new.txt', 'shared.txt']);

	// the same file changed where work starts, too: the edit has no place there
	writeFileSync(join(repoPath, 'shared.txt'), 'changed on main\n');
	run(repoPath, 'commit', '-qam', 'change it on main');
	await expect(continueOn(worktree, repoPath)).rejects.toThrow('shared.txt');
	expect(branchOf(worktree)).toBe(branch);
	expect(readFileSync(join(worktree.path, 'shared.txt'), 'utf8')).toBe('edited since\n');
	expect(run(repoPath, 'branch', '--list', worktree.branch + '-3')).toBe('');
});

it('abandons a continuation if a turn starts while the branch is being made', async () => {
	const repoPath = repo();
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
	const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');
	let checks = 0;
	await expect(
		continueOn(worktree, repoPath, () => {
			if (++checks === 2) throw new Error('Its agent is still at work');
		})
	).rejects.toThrow('Its agent is still at work');
	expect(branchOf(worktree)).toBe(worktree.branch);
	expect(await continueOn(worktree, repoPath)).toBe(worktree.branch + '-2');
});

it('runs Git once for a burst of identical changes requests and reads again afterward', async () => {
	const repoPath = repo();
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
	const worktree = await ensureWorktree(base, repoPath, 'abcdefgh-1');
	const trace = join(base, 'trace');
	const original = process.env.GIT_TRACE2_EVENT;
	process.env.GIT_TRACE2_EVENT = trace;
	const commands = () =>
		readFileSync(trace, 'utf8')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line))
			.filter((event) => event.event === 'start').length;
	try {
		await status(worktree, { repoPath });
		const single = commands();
		expect(single).toBeGreaterThan(0);
		writeFileSync(join(worktree.path, 'new.txt'), 'new');
		const results = await Promise.all(
			Array.from({ length: 12 }, () => status(worktree, { repoPath }))
		);
		expect(commands()).toBe(2 * single);
		expect(results.every((result) => result.uncommitted === 1)).toBe(true);
	} finally {
		if (original === undefined) delete process.env.GIT_TRACE2_EVENT;
		else process.env.GIT_TRACE2_EVENT = original;
	}
});

it('sees an edit of the same size in the same second as the index', async () => {
	const repoPath = repo();
	const base = mkdtempSync(join(tmpdir(), 'geordi-turn-'));
	try {
		const wt = await ensureWorktree(base, repoPath, '12345678');
		const file = join(wt.path, 'example');
		// file and index from the same second: Git can tell the file apart only by reading it
		const second = new Date('2026-11-19T12:00:00Z');
		writeFileSync(file, 'before\n');
		utimesSync(file, second, second);
		execFileSync('git', ['-C', wt.path, 'add', 'example']);
		utimesSync(join(wt.adminDir, 'index'), second, second);
		const finish = startTurnDiff(wt, base);
		writeFileSync(file, 'during\n');
		utimesSync(file, second, second);
		expect(finish()?.patch).toContain('-before\n+during');
	} finally {
		rmSync(base, { recursive: true, force: true });
		rmSync(repoPath, { recursive: true, force: true });
	}
});

it('captures net changes across a commit without staging files or including earlier edits', async () => {
	const repoPath = repo();
	const base = mkdtempSync(join(tmpdir(), 'geordi-turn-'));
	try {
		const wt = await ensureWorktree(base, repoPath, '12345678');
		const write = (name: string, text: string) => writeFileSync(join(wt.path, name), text);
		const git = (...args: string[]) =>
			execFileSync('git', ['-C', wt.path, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
				encoding: 'utf8'
			});
		write('existing', 'before\n');
		write('untouched', 'already dirty\n');
		write('.gitignore', 'ignored\n');
		git('add', 'existing');
		const finish = startTurnDiff(wt, base);
		write('existing', 'after\n');
		git('add', 'existing');
		git('commit', '-qm', 'change');
		write('added', 'one\ntwo\n');
		write('ignored', 'excluded');
		const diff = finish();
		expect(diff).toMatchObject({
			files: [{ path: 'added' }, { path: 'existing' }],
			added: 3,
			removed: 1
		});
		expect(diff?.patch).toContain('-before\n+after');
		expect(git('diff', '--cached', '--name-only')).toBe('');
		expect(startTurnDiff(wt, base)()).toBeUndefined();
		const large = startTurnDiff(wt, base);
		write('large', 'lots of text\n'.repeat(30000));
		expect(large()).toMatchObject({ files: [{ path: 'large' }], added: 30000, tooLarge: true });
	} finally {
		rmSync(base, { recursive: true, force: true });
		rmSync(repoPath, { recursive: true, force: true });
	}
});
