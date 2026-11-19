import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { editReleaseNote, fromSweet, releasePlan, type ReleaseAdapter } from './releases.ts';
import { ensureWorktree } from './worktree.ts';

async function worktree() {
	const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-release-')));
	const git = (...args: string[]) =>
		execFileSync('git', ['-C', repoPath, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
	git('init', '-q');
	git('commit', '-q', '--allow-empty', '-m', 'init');
	const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
	return await ensureWorktree(base, repoPath, 'abcdefgh-1');
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
		command: 'notes status',
		detects: () => true,
		read: async () => [pkg],
		...over
	});
	const added = () => new Set(['pkg/.notes/new.md']);
	const yes = () => true;
	const no = () => false;

	it('has nothing to say about a repository that uses no release tool', async () => {
		expect(
			await releasePlan(await worktree(), added, yes, [adapter({ detects: () => false })])
		).toBeNull();
	});

	it('says what is pending, and which of it the workspace adds', async () => {
		const plan = await releasePlan(await worktree(), added, yes, [adapter()]);
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
		expect(await releasePlan(await worktree(), added, yes, [failing])).toEqual({
			tool: 'notes',
			name: 'Notes',
			packages: [],
			problem: 'notes is not installed on this machine',
			ask: null
		});
	});

	it('runs nothing in a repository until a person has agreed to it, and says what there is to agree to', async () => {
		let ran = false;
		const watched = adapter({
			read: async () => {
				ran = true;
				return [pkg];
			}
		});
		expect(await releasePlan(await worktree(), added, no, [watched])).toEqual({
			tool: 'notes',
			name: 'Notes',
			packages: [],
			problem: null,
			ask: 'notes status'
		});
		expect(ran).toBe(false);
	});

	it('knows a repository that uses Sweet Release by its configuration, at the top or in a package', async () => {
		const plain = await worktree();
		expect(await releasePlan(plain, added, no)).toBeNull();

		writeFileSync(join(plain.path, '.sweet.config.yml'), 'types:\n  fix:\n    bump: patch\n');
		expect(await releasePlan(plain, added, no)).toMatchObject({
			tool: 'sweet-release',
			ask: 'sweet status --json'
		});

		const nested = await worktree();
		mkdirSync(join(nested.path, 'apps/api'), { recursive: true });
		writeFileSync(join(nested.path, 'apps/api/.sweet.yml'), 'version: 1.0.0\n');
		expect((await releasePlan(nested, added, no))?.tool).toBe('sweet-release');
	});
});

it('saves a note body with its original metadata and refuses a stale draft', async () => {
	const tree = await worktree();
	const path = '.sweet/a-note.md';
	const file = join(tree.path, path);
	const header = '---\r\ntype: fix\r\nbreaking: true\r\n# preserve this comment\r\n---\r\n\r\n';
	mkdirSync(join(tree.path, '.sweet'));
	writeFileSync(file, header + 'Long original body\r\n');
	const plan = await releasePlan(
		tree,
		() => new Set([path]),
		() => true,
		[
			{
				tool: 'sweet-release',
				name: 'Sweet Release',
				command: 'sweet status --json',
				detects: () => true,
				read: async () =>
					fromSweet(
						JSON.stringify([
							{ path: '.', changes: [{ path, type: 'fix', body: 'Long original body' }] }
						])
					)
			}
		]
	);
	const edit = { path, original: 'Long original body', body: 'A\nB' };
	editReleaseNote(tree, plan, edit);
	expect(readFileSync(file, 'utf8')).toBe(header + 'A\r\nB\r\n');
	expect(() => editReleaseNote(tree, plan, edit)).toThrow('note changed');
	expect(() => editReleaseNote(tree, null, edit)).toThrow('no longer available');
	expect(readFileSync(file, 'utf8')).toBe(header + 'A\r\nB\r\n');
});
