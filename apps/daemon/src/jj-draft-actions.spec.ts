import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { nativeWorkspaces } from './jj-workspaces.ts';

it.skipIf(spawnSync('jj', ['--version']).status !== 0)(
	'restacks and publishes scoped drafts without granting agents store access',
	async () => {
		const scratch = resolve(import.meta.dirname, '../../../.context');
		mkdirSync(scratch, { recursive: true });
		const dir = mkdtempSync(join(scratch, 'jj-draft-actions-'));
		const root = join(dir, 'workspaces'),
			control = join(dir, 'control'),
			origin = join(dir, 'origin.git');
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
		const jj = (...args: string[]) =>
			execFileSync('jj', ['-R', control, ...args], { cwd: dir, encoding: 'utf8' }).trim();
		try {
			git('init', '--bare', origin);
			execFileSync('jj', ['git', 'init', '--no-colocate', control], { cwd: dir });
			jj('config', 'set', '--repo', 'user.name', 'Geordi Test');
			jj('config', 'set', '--repo', 'user.email', 'geordi@example.com');
			jj('git', 'remote', 'add', 'origin', origin);
			jj('describe', '-m', 'initial base');
			jj('bookmark', 'create', 'start', '-r', '@');
			const open = () => nativeWorkspaces(root, dir, control, undefined, true);
			const backend = (await open())!;
			const parent = { repoPath: dir, worktreeId: randomUUID(), base: 'start' };
			expect(backend.matches(parent)).toBe(true);
			expect(backend.matches({ ...parent, branch: 'geordi/old-archived-branch' })).toBe(false);
			const p = await backend.prepare(parent);
			expect(backend.matches({ ...parent, branch: p.branch })).toBe(true);
			writeFileSync(join(p.path, 'api'), 'original');
			await backend.draft!(parent, 'snapshot', 'feat: add API');
			const child = { ...parent, worktreeId: randomUUID(), base: p.branch };
			const c = await backend.prepare(child);
			if (process.platform === 'darwin') {
				// Exercise a real OS write boundary. The helper can edit its files but
				// cannot change a shared bookmark directly through the jj CLI.
				const profile =
					'(version 1)(allow default)(deny file-write* (subpath ' + JSON.stringify(control) + '))';
				execFileSync(
					'sandbox-exec',
					['-p', profile, '/bin/sh', '-c', "printf 'child edit' > client"],
					{ cwd: c.path }
				);
				const denied = spawnSync(
					'sandbox-exec',
					['-p', profile, 'jj', 'bookmark', 'set', p.branch, '-r', '@'],
					{ cwd: c.path, encoding: 'utf8' }
				);
				expect(denied.status).not.toBe(0);
				expect(denied.stderr).toMatch(/not permitted|permission denied/i);
			} else {
				writeFileSync(join(c.path, 'client'), 'child edit');
			}
			await backend.draft!(child, 'snapshot', 'test: cover API');
			await backend.draft!(child, 'publish');
			const old = git('--git-dir', origin, 'rev-parse', 'refs/heads/' + c.branch);
			writeFileSync(join(p.path, 'api'), 'revised');
			await backend.draft!(parent, 'snapshot', 'feat: revise API');
			writeFileSync(join(c.path, 'local'), 'local edit');
			await expect(backend.draft!(child, 'publish')).rejects.toThrow(/refresh/i);
			const restarted = (await open())!;
			writeFileSync(join(c.path, 'api'), 'local conflict');
			await expect(restarted.draft!(child, 'refresh')).rejects.toThrow();
			expect(readFileSync(join(c.path, 'api'), 'utf8')).toBe('local conflict');
			writeFileSync(join(c.path, 'api'), 'original');
			await restarted.draft!(child, 'refresh');
			expect(readFileSync(join(c.path, 'api'), 'utf8')).toBe('revised');
			expect(readFileSync(join(c.path, 'local'), 'utf8')).toBe('local edit');
			expect(await restarted.versions(child, 'client')).toEqual({ old: null, new: 'child edit' });
			await expect(restarted.draft!(child, 'publish')).rejects.toThrow(/snapshot/i);
			await restarted.draft!(child, 'snapshot', 'test: cover revised API');
			const result = await restarted.draft!(child, 'publish');
			expect(result.branch).toBe(c.branch);
			expect(git('--git-dir', origin, 'rev-parse', 'refs/heads/' + c.branch)).toBe(result.revision);
			expect(result.revision).not.toBe(old);
			expect(git('--git-dir', origin, 'branch', '--format=%(refname:short)')).toBe(c.branch);
			await restarted.archive(child);
			expect(existsSync(c.path)).toBe(false);
			await restarted.prepare(child, true);
			await restarted.draft!(child, 'refresh');
			expect(readFileSync(join(c.path, 'local'), 'utf8')).toBe('local edit');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	},
	60000
);
