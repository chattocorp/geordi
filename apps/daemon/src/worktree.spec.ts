import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changes, diff } from './changes.ts';
import { ensureWorktree, locateWorktree } from './worktree.ts';

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
		expect(changes(worktree, repoPath)).toEqual([]);

		// committed in the workspace
		writeFileSync(join(worktree.path, 'committed.txt'), 'a\n');
		const git = (...args: string[]) => execFileSync('git', ['-C', worktree.path, ...args]);
		git('add', '.');
		git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'work');
		// uncommitted, and untracked
		writeFileSync(join(worktree.path, 'kept.txt'), 'one\nTWO\nthree\n');
		writeFileSync(join(worktree.path, 'new.txt'), 'x\ny\n');

		expect(changes(worktree, repoPath)).toEqual([
			{ path: 'committed.txt', added: 1, removed: 0 },
			{ path: 'kept.txt', added: 2, removed: 1 },
			{ path: 'new.txt', added: 2, removed: 0 }
		]);
		expect(diff(worktree, repoPath, 'kept.txt')).toContain('+TWO');
		expect(diff(worktree, repoPath, 'new.txt')).toContain('+x\n+y\n');
		expect(() => diff(worktree, repoPath, '../outside')).toThrow(/outside repository/);
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

		expect(changes(worktree, repoPath)).toEqual([{ path: 'new.txt', added: 1, removed: 0 }]);
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

		changes(worktree, repoPath);
		expect(existsSync(marker)).toBe(false);
	});
});
