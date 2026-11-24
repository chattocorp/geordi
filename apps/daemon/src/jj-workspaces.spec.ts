import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { nativeWorkspaces } from './jj-workspaces.ts';

it.skipIf(spawnSync('jj', ['--version']).status !== 0)(
	'reopens the native child snapshot and its files after archiving and a new backend instance',
	async () => {
		const scratch = resolve(import.meta.dirname, '../../../.context');
		mkdirSync(scratch, { recursive: true });
		const dir = mkdtempSync(join(scratch, 'native-workspaces-'));
		const control = join(dir, 'control');
		const root = join(dir, 'workspaces');
		const jj = (cwd: string, ...args: string[]) =>
			execFileSync(
				'jj',
				['--config', 'user.name="Test"', '--config', 'user.email="test@example.org"', ...args],
				{ cwd, stdio: 'pipe', encoding: 'utf8' }
			).trim();
		let notification = Promise.withResolvers<string>();
		const open = async () =>
			(await nativeWorkspaces(root, dir, control, (id) => notification.resolve(id)))!;
		const parentRef = { repoPath: dir, worktreeId: randomUUID() };
		try {
			jj(dir, 'git', 'init', '--no-colocate', control);
			const backend = await open();
			const draft = jj(control, 'log', '--no-graph', '-r', '@', '-T', 'commit_id');
			jj(control, 'bookmark', 'create', 'start', '-r', draft);
			const parent = await backend.prepare({ ...parentRef, base: 'start' });
			writeFileSync(join(parent.path, 'api'), 'first');
			writeFileSync(join(parent.path, 'obsolete'), 'remove me');
			jj(parent.path, 'bookmark', 'create', parent.branch, '-r', '@');
			const childRef = { ...parentRef, worktreeId: randomUUID(), base: parent.branch };
			backend.watch([childRef]);
			const child = await backend.prepare(childRef);
			expect(await notification.promise).toBe(childRef.worktreeId);
			notification = Promise.withResolvers<string>();
			expect(existsSync(join(child.path, '.git'))).toBe(false);
			writeFileSync(join(child.path, 'client'), 'child');
			expect(await notification.promise).toBe(childRef.worktreeId);
			backend.watch([]);
			jj(child.path, 'status');
			writeFileSync(join(parent.path, 'api'), 'revised');
			jj(parent.path, 'status');
			jj(child.path, 'workspace', 'update-stale');
			const expected = { old: null, new: 'child' };
			expect(await backend.versions(childRef, 'client')).toEqual(expected);
			writeFileSync(join(child.path, 'unsnapshotted'), 'still editing');
			const before = jj(
				child.path,
				'--ignore-working-copy',
				'log',
				'--no-graph',
				'-r',
				'@',
				'-T',
				'commit_id'
			);
			expect(await backend.versions(childRef, 'unsnapshotted')).toEqual({
				old: null,
				new: 'still editing'
			});
			rmSync(join(child.path, 'obsolete'));
			expect(await backend.versions(childRef, 'obsolete')).toEqual({ old: 'remove me', new: null });
			expect((await backend.status(childRef)).uncommitted).toBe(2);
			writeFileSync(join(child.path, '.context', 'scratch'), 'ignored');
			await backend.archive(childRef);
			expect(existsSync(child.path + '.archived')).toBe(false);
			expect(existsSync(child.path + '.removing')).toBe(false);
			expect(existsSync(child.path)).toBe(false);
			expect(existsSync(join(root, '.archive-ws-' + childRef.worktreeId))).toBe(false);
			const restarted = await open();
			await restarted.archive(childRef); // A retried archive keeps the checkpoint.
			// An interrupted materialization must not be mistaken for a completed restore.
			writeFileSync(child.path + '.restoring', 'interrupted');
			mkdirSync(child.path);
			writeFileSync(join(child.path, 'partial'), 'incomplete');

			await restarted.prepare(childRef, true);
			expect(existsSync(join(child.path, 'partial'))).toBe(false);
			expect(existsSync(join(child.path, 'obsolete'))).toBe(false);
			expect(existsSync(join(child.path, '.context', 'scratch'))).toBe(false);
			expect(
				jj(child.path, '--ignore-working-copy', 'log', '--no-graph', '-r', '@', '-T', 'commit_id')
			).toBe(before);
			expect(await restarted.versions(childRef, 'client')).toEqual(expected);
			expect((await restarted.status(childRef)).files.map((file) => file.path)).toEqual([
				'client',
				'obsolete',
				'unsnapshotted'
			]);
			expect(readFileSync(join(child.path, 'api'), 'utf8')).toBe('revised');
			expect(readFileSync(join(child.path, 'unsnapshotted'), 'utf8')).toBe('still editing');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	},
	30_000
);
