import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { nativeWorkspaces } from './jj-workspaces.ts';

it.skipIf(
	process.platform !== 'darwin' ||
		spawnSync('jj', ['--version'], { encoding: 'utf8' }).stdout?.trim() !== 'jj 0.45.1'
)(
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
			execFileSync(
				resolve(import.meta.dirname, '../../../scripts/prototypes/build-jj-checkout.sh'),
				[join(dir, 'bin', 'geordi-jj-checkout')]
			);
			const status = (path: string) =>
				execFileSync('jj', ['status'], { cwd: path, encoding: 'utf8' });
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
			writeFileSync(join(c.path, 'README2.md'), 'keep these exact bytes');
			writeFileSync(join(c.path, 'client'), 'edited child');
			writeFileSync(join(p.path, 'api'), 'revised');
			await backend.draft!(parent, 'snapshot', 'feat: revise API');
			expect(status(p.path)).toContain('api');
			expect(status(c.path)).toContain('README2.md');
			expect(readFileSync(join(c.path, 'README2.md'), 'utf8')).toBe('keep these exact bytes');
			expect(readFileSync(join(c.path, 'client'), 'utf8')).toBe('edited child');
			expect(readFileSync(join(c.path, 'api'), 'utf8')).toBe('revised');
			expect(
				jj('--ignore-working-copy', 'log', '-r', 'divergent()', '--no-graph', '-T', 'commit_id')
			).toBe('');
			expect(git('--git-dir', origin, 'rev-parse', 'refs/heads/' + c.branch)).toBe(old);
			// A CLI snapshot and another unsnapshotted edit must both survive restart.
			const restarted = (await open())!;
			writeFileSync(join(c.path, 'local'), 'local edit');
			await restarted.draft!(child, 'refresh');
			expect(await restarted.versions(child, 'client')).toEqual({ old: null, new: 'edited child' });
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
			writeFileSync(join(c.path, 'api'), 'child overlaps parent');
			writeFileSync(join(p.path, 'api'), 'another parent revision');
			await expect(restarted.draft!(parent, 'snapshot', 'feat: another revision')).rejects.toThrow(
				/Saved draft .*Could not refresh dependent/s
			);
			expect(readFileSync(join(c.path, 'api'), 'utf8')).toBe('child overlaps parent');
			writeFileSync(join(c.path, 'api'), 'revised');
			await restarted.draft!(child, 'refresh');
			expect(status(c.path)).toContain('client');
			// The originally reported ordering: revise, THEN create README2.md,
			// then run ordinary jj status in that same checkout.
			writeFileSync(join(p.path, 'README2.md'), 'after the revision');
			expect(status(p.path)).toContain('README2.md');
			expect(readFileSync(join(p.path, 'README2.md'), 'utf8')).toBe('after the revision');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	},
	300000
);
