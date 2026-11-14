import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { status, versions } from './changes.ts';
import { createWatches } from './watch.ts';
import { ensureWorktree, locateWorktree } from './worktree.ts';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setup() {
	const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-watch-')));
	const git = (cwd: string, ...args: string[]) =>
		execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
	git(repoPath, 'init', '-q');
	git(repoPath, 'commit', '-q', '--allow-empty', '-m', 'init');
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
	const ref = { worktreeId: 'abcdefgh-1', repoPath };

	const seen: string[] = [];
	const watches = createWatches(
		({ repoPath, worktreeId }) => locateWorktree(base, repoPath, worktreeId),
		(id) => seen.push(id)
	);
	return { base, ref, git, seen, watches };
}

describe('watching workspaces', () => {
	it('reports a burst of file changes once, and commits too', async () => {
		const { base, ref, git, seen, watches } = setup();
		const worktree = ensureWorktree(base, ref.repoPath, ref.worktreeId);
		watches.set([ref]);
		await wait(100); // let the watchers start

		writeFileSync(join(worktree.path, 'a.txt'), 'one\n');
		writeFileSync(join(worktree.path, 'b.txt'), 'two\n');
		await wait(600);
		expect(seen).toEqual([ref.worktreeId]);

		git(worktree.path, 'add', '.');
		git(worktree.path, 'commit', '-qm', 'work');
		await wait(600);
		expect(seen.length).toBeGreaterThan(1);

		watches.stop();
	});

	it('is not set off by looking at the changes', async () => {
		const { base, ref, seen, watches } = setup();
		const worktree = ensureWorktree(base, ref.repoPath, ref.worktreeId);
		writeFileSync(join(worktree.path, 'a.txt'), 'one\n');
		await wait(300); // let that write pass before we start watching
		watches.set([ref]);
		await wait(600);
		seen.length = 0;

		expect(status(worktree, ref)).toMatchObject({ uncommitted: 1 });
		expect(versions(worktree, ref, 'a.txt')).toEqual({ old: null, new: 'one\n' });
		await wait(600);
		expect(seen).toEqual([]);

		watches.stop();
	});

	it('stops watching workspaces nobody looks at, and picks up worktrees created later', async () => {
		const { base, ref, seen, watches } = setup();
		watches.set([ref]); // no worktree yet
		const worktree = ensureWorktree(base, ref.repoPath, ref.worktreeId);
		watches.refresh();
		await wait(100);
		writeFileSync(join(worktree.path, 'a.txt'), 'one\n');
		await wait(600);
		expect(seen).toHaveLength(1);

		watches.set([]);
		writeFileSync(join(worktree.path, 'b.txt'), 'two\n');
		await wait(600);
		expect(seen).toHaveLength(1);
	});
});
