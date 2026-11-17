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
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changes, readText, status, versions } from './changes.ts';
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
	it('creates a worktree on a new branch, idempotently', () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const first = ensureWorktree(base, repoPath, '12345678-aaaa');
		const second = ensureWorktree(base, repoPath, '12345678-aaaa');

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
		expect(startOf(repoPath)).toMatch(/^refs\/remotes\/origin\//);

		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = ensureWorktree(base, repoPath, '12345678-aaaa');
		expect(git(worktree.path, 'rev-parse', 'HEAD')).toBe(git(upstream, 'rev-parse', 'HEAD'));
		// a branch of its own: nothing it would push to by default
		expect(() => git(worktree.path, 'rev-parse', '--abbrev-ref', '@{upstream}')).toThrow();
		expect(changes(worktree, { repoPath })).toEqual([]);
	});

	it('starts from what is checked out where there is no upstream, or no reaching it', async () => {
		const repoPath = repo();
		expect(await fetchUpstream(repoPath)).toBeNull();
		expect(startOf(repoPath)).toBe('HEAD');

		execFileSync('git', ['-C', repoPath, 'remote', 'add', 'origin', '/no/such/upstream']);
		expect(await fetchUpstream(repoPath)).toEqual(expect.any(String));
		expect(startOf(repoPath)).toBe('HEAD');
	});

	it('brings a worktree that was removed back from its branch, with what was committed', () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const { path } = ensureWorktree(base, repoPath, '12345678-aaaa');
		const git = (...args: string[]) =>
			execFileSync('git', ['-C', path, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
		writeFileSync(join(path, 'committed.txt'), 'kept\n');
		git('add', '.');
		git('commit', '-qm', 'work');
		writeFileSync(join(path, 'uncommitted.txt'), 'lost\n');

		rmSync(path, { recursive: true }); // someone tidied up behind Geordi's back
		expect(() => locateWorktree(base, repoPath, '12345678-aaaa')).toThrow(NO_WORKTREE);

		const again = ensureWorktree(base, repoPath, '12345678-aaaa');
		expect(again).toMatchObject({ path, created: false, restored: true });
		expect(readFileSync(join(path, 'committed.txt'), 'utf8')).toBe('kept\n');
		expect(existsSync(join(path, 'uncommitted.txt'))).toBe(false);
		expect(ensureWorktree(base, repoPath, '12345678-aaaa')).toMatchObject({ restored: false });

		// with its branch gone too, there is nothing to bring back: it starts afresh
		rmSync(path, { recursive: true });
		execFileSync('git', ['-C', repoPath, 'worktree', 'prune']);
		execFileSync('git', ['-C', repoPath, 'branch', '-qD', 'geordi/12345678']);
		expect(ensureWorktree(base, repoPath, '12345678-aaaa')).toMatchObject({
			created: true,
			restored: false
		});
		expect(existsSync(join(path, 'committed.txt'))).toBe(false);
	});

	it('reports a branch the agent renamed, and comes back from it', () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = ensureWorktree(base, repoPath, '12345678-aaaa');
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
		expect(status(worktree, { repoPath })).toMatchObject({ branch: 'geordi/fix-login' });

		removeWorktree(base, repoPath, '12345678-aaaa', false);
		const again = ensureWorktree(base, repoPath, '12345678-aaaa', undefined, 'geordi/fix-login');
		expect(again).toMatchObject({ restored: true, branch: 'geordi/fix-login' });
		expect(readFileSync(join(worktree.path, 'committed.txt'), 'utf8')).toBe('kept\n');
	});

	it('knows a branch by the name it was pushed under', () => {
		// an upstream, and a clone of it in which a workspace's branch was pushed under another name
		const upstream = repo();
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-clone-')));
		execFileSync('git', ['clone', '-q', upstream, repoPath]);
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = ensureWorktree(base, repoPath, '12345678-aaaa');
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
		expect(upstreamBranchOf(repoPath, worktree.branch)).toBe('geordi/12345678');
		expect(status(worktree, { repoPath }).unpushed).toBeNull();

		git('commit', '-q', '--allow-empty', '-m', 'work');
		git('push', '-q', '-u', 'origin', 'HEAD:a-better-name');
		expect(upstreamBranchOf(repoPath, worktree.branch)).toBe('a-better-name');
		expect(status(worktree, { repoPath }).unpushed).toBe(0);
		git('commit', '-q', '--allow-empty', '-m', 'more work');
		expect(status(worktree, { repoPath }).unpushed).toBe(1);

		// merely set to follow the main branch, it has no place of its own upstream
		const main = execFileSync('git', ['-C', upstream, 'branch', '--show-current'], {
			encoding: 'utf8'
		}).trim();
		git('branch', '-q', `--set-upstream-to=origin/${main}`);
		expect(upstreamBranchOf(repoPath, worktree.branch)).toBe('geordi/12345678');
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
		const worktree = ensureWorktree(base, repoPath, '12345678-aaaa');

		// work in the workspace, and meanwhile something else lands upstream
		writeFileSync(join(worktree.path, 'mine.txt'), 'mine\n');
		run(worktree.path, 'add', '.');
		run(worktree.path, 'commit', '-qm', 'my work');
		writeFileSync(join(upstream, 'landed.txt'), 'landed\n');
		run(upstream, 'add', '.');
		run(upstream, 'commit', '-qm', 'landed upstream');
		await fetchUpstream(repoPath);

		expect(continueOn(worktree, repoPath)).toBe('geordi/12345678-2');
		// on the new branch, with the upstream's files and none of its own old ones
		expect(run(worktree.path, 'branch', '--show-current')).toBe('geordi/12345678-2');
		expect(run(worktree.path, 'rev-parse', 'HEAD')).toBe(run(upstream, 'rev-parse', 'HEAD'));
		expect(existsSync(join(worktree.path, 'landed.txt'))).toBe(true);
		expect(existsSync(join(worktree.path, 'mine.txt'))).toBe(false);
		expect(run(worktree.path, 'status', '--porcelain')).toBe('');
		expect(changes(worktree, { repoPath })).toEqual([]);
		// what was done before is still on its branch
		expect(run(repoPath, 'log', '--format=%s', '-1', 'geordi/12345678')).toBe('my work');

		// a HEAD the agent turned into a link is replaced, not written through
		const elsewhere = join(base, 'not-the-agents-to-write.txt');
		writeFileSync(elsewhere, 'precious\n');
		rmSync(join(worktree.adminDir, 'HEAD'));
		symlinkSync(elsewhere, join(worktree.adminDir, 'HEAD'));
		writeFileSync(elsewhere, 'ref: refs/heads/geordi/12345678-2\n'); // what git would read through it
		continueOn(worktree, repoPath);
		expect(readFileSync(elsewhere, 'utf8')).toBe('ref: refs/heads/geordi/12345678-2\n');
		expect(lstatSync(join(worktree.adminDir, 'HEAD')).isSymbolicLink()).toBe(false);

		// and a worktree that goes missing comes back on the branch it was on
		expect(run(worktree.path, 'branch', '--show-current')).toBe('geordi/12345678-3');
		rmSync(worktree.path, { recursive: true });
		const back = ensureWorktree(base, repoPath, '12345678-aaaa', undefined, 'geordi/12345678-3');
		expect(back).toMatchObject({ restored: true, branch: 'geordi/12345678-3' });
		expect(run(back.path, 'branch', '--show-current')).toBe('geordi/12345678-3');
	});

	it('refuses a worktree whose Git metadata was repointed', () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const { path, writableRoots } = ensureWorktree(base, repoPath, '12345678-aaaa');
		const evil = mkdtempSync(join(tmpdir(), 'geordi-evil-'));

		const commondir = join(writableRoots.at(-1)!, 'commondir');
		writeFileSync(commondir, evil);
		expect(() => ensureWorktree(base, repoPath, '12345678-aaaa')).toThrow(/was modified/);

		writeFileSync(commondir, '../..');
		expect(() => ensureWorktree(base, repoPath, '12345678-aaaa')).not.toThrow();

		writeFileSync(join(path, '.git'), `gitdir: ${evil}`);
		expect(() => ensureWorktree(base, repoPath, '12345678-aaaa')).toThrow(/was modified/);
	});

	it('locates only worktrees that exist', () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		expect(() => locateWorktree(base, repoPath, '12345678-aaaa')).toThrow(/no worktree/);
		const { path } = ensureWorktree(base, repoPath, '12345678-aaaa');
		expect(locateWorktree(base, repoPath, '12345678-aaaa').path).toBe(path);
	});

	it('never makes hooks or config writable', () => {
		const { writableRoots } = ensureWorktree(
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
	it('reports committed, uncommitted and untracked changes against the fork point', () => {
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
		const worktree = ensureWorktree(base, repoPath, 'abcdefgh-1');
		expect(changes(worktree, { repoPath })).toEqual([]);

		// committed in the workspace
		writeFileSync(join(worktree.path, 'committed.txt'), 'a\n');
		const git = (...args: string[]) => execFileSync('git', ['-C', worktree.path, ...args]);
		git('add', '.');
		git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'work');
		// uncommitted, and untracked
		writeFileSync(join(worktree.path, 'kept.txt'), 'one\nTWO\nthree\n');
		writeFileSync(join(worktree.path, 'new.txt'), 'x\ny\n');

		expect(changes(worktree, { repoPath })).toEqual([
			{ path: 'committed.txt', status: 'added', added: 1, removed: 0 },
			{ path: 'kept.txt', status: 'modified', added: 2, removed: 1 },
			{ path: 'new.txt', status: 'added', added: 2, removed: 0 }
		]);
		const origin = { repoPath };
		expect(versions(worktree, origin, 'kept.txt')).toEqual({
			old: 'one\ntwo\n',
			new: 'one\nTWO\nthree\n'
		});
		expect(versions(worktree, origin, 'new.txt')).toEqual({ old: null, new: 'x\ny\n' });
		expect(versions(worktree, origin, 'committed.txt')).toEqual({ old: null, new: 'a\n' });

		// deleted, and binary
		rmSync(join(worktree.path, 'kept.txt'));
		writeFileSync(join(worktree.path, 'blob.bin'), Buffer.from([1, 0, 2]));
		expect(versions(worktree, origin, 'kept.txt')).toEqual({ old: 'one\ntwo\n', new: null });
		expect(versions(worktree, origin, 'blob.bin')).toEqual({
			unavailable: expect.stringMatching(/binary/)
		});
		const kept = () => changes(worktree, origin).filter((file) => /kept/.test(file.path));
		expect(kept()).toEqual([{ path: 'kept.txt', status: 'deleted', added: 0, removed: 2 }]);

		// moved: one change, not a deletion and an addition, and its old version is the old file's
		writeFileSync(join(worktree.path, 'kept.txt'), 'one\ntwo\n');
		git('mv', 'kept.txt', 'kept elsewhere.txt');
		expect(kept()).toEqual([
			{ path: 'kept elsewhere.txt', status: 'renamed', from: 'kept.txt', added: 0, removed: 0 }
		]);
		expect(versions(worktree, origin, 'kept elsewhere.txt')).toEqual({
			old: 'one\ntwo\n',
			new: 'one\ntwo\n'
		});
	});

	it('only shows files that changed, never what a path or a symlink leads to', () => {
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
		const worktree = ensureWorktree(base, repoPath, 'abcdefgh-1');
		const secret = join(base, 'secret.txt');
		writeFileSync(secret, 'do not show');
		symlinkSync(base, join(worktree.path, 'elsewhere'));
		symlinkSync(secret, join(worktree.path, 'link.txt'));

		const none = { unavailable: expect.stringMatching(/no changes/) };
		const origin = { repoPath };
		expect(versions(worktree, origin, '../secret.txt')).toEqual(none);
		expect(versions(worktree, origin, secret)).toEqual(none);
		expect(versions(worktree, origin, 'elsewhere/secret.txt')).toEqual(none);
		expect(versions(worktree, origin, 'README.md')).toEqual(none);
		// a named pipe must not make us wait for a writer that never comes
		execFileSync('mkfifo', [join(worktree.path, 'pipe')]);
		expect(readText(worktree, 'pipe')).toBeNull();
		rmSync(join(worktree.path, 'pipe'));

		// a tracked file whose directory was swapped for a link to somewhere else: git reports
		// the file as changed (deleted), while the path now leads out of the worktree
		rmSync(join(worktree.path, 'sub'), { recursive: true });
		symlinkSync(base, join(worktree.path, 'sub'));
		expect(changes(worktree, origin).map((file) => file.path)).toContain('sub/secret.txt');
		expect(JSON.stringify(versions(worktree, origin, 'sub/secret.txt'))).not.toContain(
			'do not show'
		);

		// the link itself changed (it is new), but what it points to is not ours to show
		expect(versions(worktree, origin, 'link.txt')).toEqual({
			unavailable: expect.stringMatching(/not a regular file/)
		});
	});

	it('branches sub-workspaces off their parent and measures changes against it', () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const parent = ensureWorktree(base, repoPath, 'parent00-1');
		const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args]);
		writeFileSync(join(parent.path, 'parent.txt'), 'p\n');
		git(parent.path, 'add', '.');
		git(parent.path, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'parent');

		const child = ensureWorktree(base, repoPath, 'child000-1', parent.branch);
		expect(existsSync(join(child.path, 'parent.txt'))).toBe(true);
		writeFileSync(join(child.path, 'child.txt'), 'c\n');

		// against the parent: only the child's own work; against the repository: both
		const origin = { repoPath, base: parent.branch };
		expect(changes(child, origin).map((file) => file.path)).toEqual(['child.txt']);
		expect(changes(child, { repoPath }).map((file) => file.path)).toEqual([
			'child.txt',
			'parent.txt'
		]);
		expect(() => ensureWorktree(base, repoPath, 'evil0000-1', '--detach')).toThrow(/branch name/);
	});

	it("ignores config an agent plants in the worktree's admin directory", () => {
		const repoPath = repo();
		execFileSync('git', ['-C', repoPath, 'config', 'extensions.worktreeConfig', 'true']);
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = ensureWorktree(base, repoPath, 'abcdefgh-1');

		const marker = join(base, 'pwned');
		writeFileSync(
			join(worktree.adminDir, 'config.worktree'),
			`[core]\n\tfsmonitor = "touch ${marker}; false"\n`
		);
		writeFileSync(join(worktree.path, 'new.txt'), 'x\n');

		expect(changes(worktree, { repoPath })).toEqual([
			{ path: 'new.txt', status: 'added', added: 1, removed: 0 }
		]);
		expect(existsSync(marker)).toBe(false);
	});

	it('never runs git inside a submodule an agent planted', () => {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = ensureWorktree(base, repoPath, 'abcdefgh-1');

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

		changes(worktree, { repoPath });
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
		const worktree = ensureWorktree(base, repoPath, 'incoming-1');
		const origin = { repoPath };
		const branch = startOf(repoPath);
		expect(status(worktree, origin).incoming).toEqual({ branch, commits: 0 });
		git(worktree.path, 'commit', '-qm', 'workspace work', '--allow-empty');
		git(upstream, 'commit', '-qm', 'upstream work', '--allow-empty');
		expect(status(worktree, origin).incoming?.commits).toBe(0);
		await fetchUpstream(repoPath);
		expect(status(worktree, origin).incoming).toEqual({ branch, commits: 1 });
		git(worktree.path, 'merge', '-qm', 'Merge upstream', branch);
		expect(status(worktree, origin).incoming?.commits).toBe(0);
	});

	it('compares child workspaces with their parent branch', () => {
		const { repoPath, base, worktree, git } = workspace();
		const child = ensureWorktree(base, repoPath, 'child-1', worktree.branch);
		git('commit', '-qm', 'parent work', '--allow-empty');
		expect(status(child, { repoPath, base: worktree.branch }).incoming).toEqual({
			branch: branchRef(worktree.branch),
			commits: 1
		});
	});

	function workspace() {
		const repoPath = repo();
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		const worktree = ensureWorktree(base, repoPath, 'abcdefgh-1');
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

	it('knows when all a branch did is in the branch it started from', () => {
		const { repoPath, worktree, git, origin } = workspace();
		writeFileSync(join(worktree.path, 'a.txt'), 'a\n');
		git('add', 'a.txt');
		git('commit', '-q', '-m', 'Add a');
		expect(status(worktree, origin)).toMatchObject({ landed: false, files: [{ path: 'a.txt' }] });

		// merged where it came from (as the agent that started this one does)
		execFileSync('git', ['-C', repoPath, 'merge', '-q', '--ff-only', worktree.branch]);
		expect(status(worktree, origin)).toMatchObject({ landed: true, files: [], uncommitted: 0 });
	});

	it('tells uncommitted from committed from pushed', () => {
		const { repoPath, worktree, git, origin } = workspace();
		expect(status(worktree, origin)).toMatchObject({
			files: [],
			uncommitted: 0,
			unpushed: null,
			landed: false
		});

		writeFileSync(join(worktree.path, 'a.txt'), 'a\n');
		writeFileSync(join(worktree.path, 'b.txt'), 'b\n');
		expect(status(worktree, origin)).toMatchObject({ uncommitted: 2, unpushed: null });

		git('add', 'a.txt');
		git('commit', '-qm', 'a');
		expect(status(worktree, origin)).toMatchObject({ uncommitted: 1, unpushed: null });

		// pushed, as far as this machine knows: the remote-tracking branch is where we are
		const remote = 'refs/remotes/origin/geordi/abcdefgh';
		execFileSync('git', ['-C', repoPath, 'update-ref', remote, 'refs/heads/geordi/abcdefgh']);
		expect(status(worktree, origin)).toMatchObject({ uncommitted: 1, unpushed: 0 });

		git('add', '.');
		git('commit', '-qm', 'b');
		expect(status(worktree, origin)).toMatchObject({ uncommitted: 0, unpushed: 1 });
		expect(status(worktree, origin).files).toHaveLength(2);
	});

	it('removes a clean worktree, keeps its branch, and refuses to discard work unless told to', () => {
		const { repoPath, base, worktree, git } = workspace();
		writeFileSync(join(worktree.path, 'a.txt'), 'a\n');
		expect(() => removeWorktree(base, repoPath, 'abcdefgh-1', false)).toThrow(
			/uncommitted or untracked/
		);
		expect(existsSync(worktree.path)).toBe(true);

		git('add', '.');
		git('commit', '-qm', 'a');
		removeWorktree(base, repoPath, 'abcdefgh-1', false);
		expect(existsSync(worktree.path)).toBe(false);
		const branches = execFileSync('git', ['-C', repoPath, 'branch', '--list', 'geordi/*']);
		expect(String(branches)).toContain('geordi/abcdefgh');

		// git has forgotten it too
		const listed = execFileSync('git', ['-C', repoPath, 'worktree', 'list']);
		expect(String(listed)).not.toContain('abcdefgh');

		// already gone is fine; and force discards
		removeWorktree(base, repoPath, 'abcdefgh-1', false);
		const second = ensureWorktree(base, repoPath, 'second00-1');
		writeFileSync(join(second.path, 'junk.txt'), 'x\n');
		removeWorktree(base, repoPath, 'second00-1', true);
		expect(existsSync(second.path)).toBe(false);
	});

	it('never runs git on a worktree whose metadata an agent rewired', () => {
		const { repoPath, base, worktree } = workspace();
		const evil = mkdtempSync(join(tmpdir(), 'geordi-evil-'));
		const marker = join(base, 'pwned');
		// a fake Git directory with a hostile config, and the worktree pointed at it
		execFileSync('git', ['init', '-q', evil]);
		execFileSync('git', ['-C', evil, 'config', 'core.fsmonitor', `touch ${marker}; false`]);
		writeFileSync(join(worktree.path, '.git'), `gitdir: ${join(evil, '.git')}`);

		expect(() => removeWorktree(base, repoPath, 'abcdefgh-1', false)).toThrow(/was modified/);
		expect(existsSync(worktree.path)).toBe(true);
		removeWorktree(base, repoPath, 'abcdefgh-1', true);
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
