import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { status, versions } from './changes.ts';
import { concerns, createWatches } from './watch.ts';
import { ensureWorktree, locateWorktree } from './worktree.ts';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function setup() {
	const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-watch-')));
	const git = (cwd: string, ...args: string[]) =>
		execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
	git(repoPath, 'init', '-q');
	git(repoPath, 'commit', '-q', '--allow-empty', '-m', 'init');
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
	const ref = { worktreeId: 'abcdefgh-1', repoPath, worktreeParent: 'repo-2' };

	const seen: string[] = [];
	const watches = createWatches(
		(ref) => locateWorktree(base, ref),
		(id) => seen.push(id)
	);
	return { base, ref, git, seen, watches };
}

describe('watching workspaces', () => {
	it('refreshes a watched worktree when its pull target changes', () => {
		const { ref, watches, seen } = setup();
		watches.set([ref, { ...ref, worktreeId: 'other' }]);
		watches.targetChanged(ref.worktreeId);
		watches.targetChanged('unwatched');
		expect(seen).toEqual([ref.worktreeId]);
		watches.stop();
	});

	it('keeps watching the Git state of a worktree in the background once nobody has it open', async () => {
		const { base, ref, git, seen, watches } = setup();
		const worktree = await ensureWorktree(base, ref);
		// Let the checkout's filesystem notifications settle before observing this write.
		await wait(300);
		watches.set([ref], 'background');
		watches.set([ref]);
		watches.set([]);
		await wait(100); // let the watchers start

		// files alone are for whoever has it open; commits are for everyone
		writeFileSync(join(worktree.path, 'a.txt'), 'one\n');
		await wait(600);
		expect(seen).toEqual([]);
		git(worktree.path, 'add', '.');
		git(worktree.path, 'commit', '-qm', 'work');
		await wait(600);
		expect(seen.length).toBeGreaterThan(0);

		const before = seen.length;
		watches.set([], 'background');
		git(worktree.path, 'commit', '-qm', 'more', '--allow-empty');
		await wait(600);
		expect(seen).toHaveLength(before);
		watches.stop();
	});

	it('ignores in the background what happens to other worktrees’ branches', async () => {
		const { base, ref, git, seen, watches } = setup();
		const worktree = await ensureWorktree(base, ref);
		const other = await ensureWorktree(base, { ...ref, worktreeId: 'otherxyz-1' });
		watches.set([ref], 'background');
		await wait(100); // let the watchers start

		git(other.path, 'commit', '-qm', 'elsewhere', '--allow-empty');
		git(ref.repoPath, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
		await wait(600);
		expect(seen).toEqual([]);

		// its own branch pushed: the remote-tracking branch moves
		git(ref.repoPath, 'update-ref', `refs/remotes/origin/${worktree.branch}`, 'HEAD');
		await wait(600);
		expect(seen).toEqual([ref.worktreeId]);
		watches.stop();
	});

	it('reports a burst of file changes once, and commits too', async () => {
		const { base, ref, git, seen, watches } = setup();
		const worktree = await ensureWorktree(base, ref);
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
		const worktree = await ensureWorktree(base, ref);
		writeFileSync(join(worktree.path, 'a.txt'), 'one\n');
		await wait(300); // let that write pass before we start watching
		watches.set([ref]);
		await wait(600);
		seen.length = 0;

		expect(await status(worktree, ref)).toMatchObject({ uncommitted: 1 });
		expect(await versions(worktree, ref, 'a.txt')).toEqual({ old: null, new: 'one\n' });
		await wait(600);
		expect(seen).toEqual([]);

		watches.stop();
	});

	it('stops watching workspaces nobody looks at, and picks up worktrees created later', async () => {
		const { base, ref, seen, watches } = setup();
		watches.set([ref]); // no worktree yet
		const worktree = await ensureWorktree(base, ref);
		watches.restart(ref.worktreeId);
		await wait(100);
		writeFileSync(join(worktree.path, 'a.txt'), 'one\n');
		await wait(600);
		expect(seen).toHaveLength(1);

		watches.set([]);
		writeFileSync(join(worktree.path, 'b.txt'), 'two\n');
		await wait(600);
		expect(seen).toHaveLength(1);
	});

	it('watches a worktree that was removed and came back', async () => {
		const { base, ref, seen, watches } = setup();
		const { path } = await ensureWorktree(base, ref);
		watches.set([ref]);
		rmSync(path, { recursive: true });
		await wait(600);

		await ensureWorktree(base, ref); // from its branch
		watches.restart(ref.worktreeId);
		await wait(600);
		seen.length = 0;
		writeFileSync(join(path, 'a.txt'), 'one\n');
		await wait(600);
		expect(seen).toHaveLength(1);
		watches.stop();
	});

	it('knows which refs are a worktree’s own', async () => {
		const { base, ref } = setup();
		const worktree = await ensureWorktree(base, ref);
		const branch = worktree.branch;
		expect(concerns(worktree, `heads/${branch}`)).toBe(true);
		expect(concerns(worktree, `remotes/origin/${branch}`)).toBe(true);
		expect(concerns(worktree, 'heads/main')).toBe(false);
		expect(concerns(worktree, `remotes/origin/x/${branch}`)).toBe(false);
		expect(concerns(worktree, `tags/${branch}`)).toBe(false);
	});
});
