import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromSweet, releasePlan, type ReleaseAdapter } from './releases.ts';
import { ensureWorktree } from './worktree.ts';

function worktree() {
	const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-release-')));
	const git = (...args: string[]) =>
		execFileSync('git', ['-C', repoPath, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
	git('init', '-q');
	git('commit', '-q', '--allow-empty', '-m', 'init');
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
	return ensureWorktree(base, repoPath, 'abcdefgh-1');
}

describe('reading Sweet Release', () => {
	it('takes packages, their pending notes and where those lead from `sweet status --json`', () => {
		// as sweet 0.2.0 prints it
		const output = JSON.stringify([
			{
				path: 'apps/docs',
				version: '0.2.0',
				name: 'Docs',
				changes: null,
				bump: 'none',
				nextVersion: '0.2.0',
				problems: null
			},
			{
				path: 'apps/sweet',
				version: '0.3.0',
				name: 'Sweet Release',
				changes: [
					{
						path: 'apps/sweet/.sweet/blue-calm-river.md',
						type: 'fix',
						breaking: false,
						body: '\nKeep attribution inline.\n'
					}
				],
				bump: 'minor',
				nextVersion: '0.4.0',
				problems: null
			}
		]);
		expect(fromSweet(output)).toEqual([
			// nothing pending: no next version to speak of
			{
				path: 'apps/docs',
				name: 'Docs',
				version: '0.2.0',
				bump: 'none',
				nextVersion: null,
				notes: [],
				problems: []
			},
			{
				path: 'apps/sweet',
				name: 'Sweet Release',
				version: '0.3.0',
				bump: 'minor',
				nextVersion: '0.4.0',
				notes: [
					{
						path: 'apps/sweet/.sweet/blue-calm-river.md',
						type: 'fix',
						breaking: false,
						body: 'Keep attribution inline.'
					}
				],
				problems: []
			}
		]);
		expect(() => fromSweet('{"not":"a list"}')).toThrow();
	});
});

describe('releasePlan', () => {
	const pkg = {
		path: 'pkg',
		name: 'Package',
		version: '1.0.0',
		bump: 'minor',
		nextVersion: '1.1.0',
		problems: [],
		notes: [
			{ path: 'pkg/.notes/old.md', type: 'fix', breaking: false, body: 'Old' },
			{ path: 'pkg/.notes/new.md', type: 'feature', breaking: false, body: 'New' }
		]
	};
	const adapter = (over: Partial<ReleaseAdapter> = {}): ReleaseAdapter => ({
		tool: 'notes',
		name: 'Notes',
		detects: () => true,
		read: async () => [pkg],
		...over
	});
	const added = () => new Set(['pkg/.notes/new.md']);

	it('has nothing to say about a repository that uses no release tool', async () => {
		expect(await releasePlan(worktree(), added, [adapter({ detects: () => false })])).toBeNull();
	});

	it('says what is pending, and which of it the workspace adds', async () => {
		const plan = await releasePlan(worktree(), added, [adapter()]);
		expect(plan).toMatchObject({ tool: 'notes', name: 'Notes', problem: null });
		expect(plan?.packages[0].notes.map((note) => [note.body, note.added])).toEqual([
			['Old', false],
			['New', true]
		]);
	});

	it('says why, where the tool could not be asked', async () => {
		const failing = adapter({
			read: async () => {
				throw new Error('notes is not installed on this machine');
			}
		});
		expect(await releasePlan(worktree(), added, [failing])).toEqual({
			tool: 'notes',
			name: 'Notes',
			packages: [],
			problem: 'notes is not installed on this machine'
		});
	});

	it('knows a repository that uses Sweet Release by its configuration, at the top or in a package', async () => {
		const plain = worktree();
		// the tool is there or not, on this machine: either way it is this tool that is asked
		expect(await releasePlan(plain, added)).toBeNull();

		writeFileSync(join(plain.path, '.sweet.config.yml'), 'types:\n  fix:\n    bump: patch\n');
		expect((await releasePlan(plain, added))?.tool).toBe('sweet-release');

		const nested = worktree();
		mkdirSync(join(nested.path, 'apps/api'), { recursive: true });
		writeFileSync(join(nested.path, 'apps/api/.sweet.yml'), 'version: 1.0.0\n');
		expect((await releasePlan(nested, added))?.tool).toBe('sweet-release');
	});
});
