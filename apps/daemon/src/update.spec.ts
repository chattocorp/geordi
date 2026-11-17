import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { status } from './changes.ts';
import { update } from './update.ts';
import { ensureWorktree } from './worktree.ts';

const dir = (name: string) => realpathSync(mkdtempSync(join(tmpdir(), `geordi-${name}-`)));
const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
		encoding: 'utf8'
	}).trim();

/** Commits a file with the given text. */
function commit(cwd: string, file: string, text: string) {
	writeFileSync(join(cwd, file), text);
	git(cwd, 'add', file);
	git(cwd, 'commit', '-q', '-m', `write ${file}`);
}

/** An upstream, a clone of it with an author, and a workspace's worktree in the clone. */
function setup() {
	const upstream = dir('upstream');
	git(upstream, 'init', '-q', '-b', 'main');
	commit(upstream, 'a.txt', 'one\n');
	const repoPath = dir('clone');
	execFileSync('git', ['clone', '-q', upstream, repoPath]);
	git(repoPath, 'config', 'user.name', 't');
	git(repoPath, 'config', 'user.email', 't@t');
	const worktree = ensureWorktree(dir('base'), repoPath, 'update-1');
	const read = (file: string) => readFileSync(join(worktree.path, file), 'utf8');
	return { upstream, repoPath, worktree, origin: { repoPath }, read };
}

describe('update', () => {
	it('fast-forwards a branch with no commits of its own, fetching first', async () => {
		const { upstream, repoPath, worktree, origin, read } = setup();
		commit(upstream, 'b.txt', 'new upstream\n');

		expect(await update(worktree, origin)).toBe(true);
		expect(read('b.txt')).toBe('new upstream\n');
		expect(git(repoPath, 'rev-parse', worktree.branch)).toBe(git(upstream, 'rev-parse', 'main'));
		expect(status(worktree, origin)).toMatchObject({ uncommitted: 0, incoming: { commits: 0 } });
		// and git, asked in the worktree itself, finds nothing out of place
		expect(git(worktree.path, 'status', '--porcelain')).toBe('');
	});

	it('merges where the branch has commits of its own', async () => {
		const { upstream, repoPath, worktree, origin, read } = setup();
		commit(worktree.path, 'mine.txt', 'mine\n');
		const mine = git(repoPath, 'rev-parse', worktree.branch);
		commit(upstream, 'b.txt', 'new upstream\n');

		expect(await update(worktree, origin)).toBe(true);
		expect([read('mine.txt'), read('b.txt')]).toEqual(['mine\n', 'new upstream\n']);
		const parents = git(repoPath, 'log', '-1', '--format=%P', worktree.branch).split(' ');
		expect(parents).toEqual([mine, git(upstream, 'rev-parse', 'main')]);
		expect(git(repoPath, 'log', '-1', '--format=%s', worktree.branch)).toBe(
			`Merge remote-tracking branch 'origin/main' into ${worktree.branch}`
		);
		expect(git(worktree.path, 'status', '--porcelain')).toBe('');
	});

	it('leaves conflicts to the agent, with everything as it was', async () => {
		const { upstream, repoPath, worktree, origin, read } = setup();
		commit(worktree.path, 'a.txt', 'mine\n');
		const mine = git(repoPath, 'rev-parse', worktree.branch);
		commit(upstream, 'a.txt', 'theirs\n');

		expect(await update(worktree, origin)).toBe(false);
		expect(read('a.txt')).toBe('mine\n');
		expect(git(repoPath, 'rev-parse', worktree.branch)).toBe(mine);
		expect(git(worktree.path, 'status', '--porcelain')).toBe('');
	});

	it('leaves a worktree with uncommitted changes alone', async () => {
		const { upstream, repoPath, worktree, origin } = setup();
		const before = git(repoPath, 'rev-parse', worktree.branch);
		commit(upstream, 'b.txt', 'new upstream\n');

		writeFileSync(join(worktree.path, 'a.txt'), 'being worked on\n');
		expect(await update(worktree, origin)).toBe(false);
		git(worktree.path, 'checkout', '-q', 'a.txt');
		writeFileSync(join(worktree.path, 'untracked.txt'), 'new\n');
		expect(await update(worktree, origin)).toBe(false);

		expect(git(repoPath, 'rev-parse', worktree.branch)).toBe(before);
		expect(existsSync(join(worktree.path, 'b.txt'))).toBe(false);
	});

	it('has nothing to do for a branch that is up to date', async () => {
		const { repoPath, worktree, origin } = setup();
		const before = git(repoPath, 'rev-parse', worktree.branch);
		expect(await update(worktree, origin)).toBe(true);
		expect(git(repoPath, 'rev-parse', worktree.branch)).toBe(before);
	});

	it("brings a parent workspace's commits into its child, without fetching", async () => {
		const { repoPath, worktree } = setup();
		const child = ensureWorktree(dir('base'), repoPath, 'update-2', worktree.branch);
		commit(worktree.path, 'parent.txt', 'from the parent\n');

		const fetch = () => Promise.reject(new Error('fetched'));
		expect(await update(child, { repoPath, base: worktree.branch }, fetch)).toBe(true);
		expect(readFileSync(join(child.path, 'parent.txt'), 'utf8')).toBe('from the parent\n');
	});

	it('makes no commit where commits are to be signed', async () => {
		const { upstream, repoPath, worktree, origin } = setup();
		commit(worktree.path, 'mine.txt', 'mine\n');
		commit(upstream, 'b.txt', 'new upstream\n');
		git(repoPath, 'config', 'commit.gpgsign', 'true');
		expect(await update(worktree, origin)).toBe(false);
	});
});
