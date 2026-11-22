import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { releaseIncreases, reviewRelease } from './release-review.ts';
import { ensureWorktree } from './worktree.ts';

for (const tool of ['Changesets', 'Sweet Release']) {
	it.skipIf(
		tool === 'Sweet Release' &&
			!spawnSync('sweet', ['status', '--help'], { encoding: 'utf8' }).stdout?.includes('--rev')
	)(`compares the target with the merge result using ${tool}`, async () => {
		const path = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-release-test-')));
		const git = (...args: string[]) =>
			execFileSync(
				'git',
				['-C', path, '-c', 'user.name=test', '-c', 'user.email=test@example.org', ...args],
				{ encoding: 'utf8' }
			).trim();
		const write = (file: string, contents: string) => {
			mkdirSync(dirname(join(path, file)), { recursive: true });
			writeFileSync(join(path, file), contents);
		};
		const commit = () => {
			git('add', '.');
			git('commit', '-qm', 'fixture');
			return git('rev-parse', 'HEAD');
		};
		const sweet = tool === 'Sweet Release';
		const note = (id: string, level: string) =>
			write(
				sweet ? `.sweet/${id}.md` : `.changeset/${id}.md`,
				sweet ? `---\ntype: ${level}\n---\n${id}\n` : `---\n"api": ${level}\n---\n${id}\n`
			);
		git('init', '-qb', 'main');
		write('package.json', JSON.stringify({ name: 'api', version: '1.4.2' }));
		if (sweet) {
			write('.sweet.yml', 'name: api\nversion: 1.4.2\n');
			write('.sweet.config.yml', 'types:\n  patch:\n    bump: patch\n  minor:\n    bump: minor\n');
		} else {
			write(
				'package.json',
				JSON.stringify({ name: 'project', private: true, workspaces: ['packages/*'] })
			);
			write('pnpm-workspace.yaml', 'packages: ["packages/*"]\n');
			write('packages/api/package.json', JSON.stringify({ name: 'api', version: '1.4.2' }));
			write(
				'packages/client/package.json',
				JSON.stringify({ name: 'client', version: '1.4.2', dependencies: { api: '~1.4.2' } })
			);
			write('.changeset/config.json', JSON.stringify({ fixed: [['api', 'client']] }));
		}
		const initial = commit();
		git('switch', '-qc', 'feature');
		note('feature', 'minor');
		const head = commit();
		git('switch', '-q', 'main');
		note('fix', 'patch');
		const base = commit();
		const worktree = await ensureWorktree(mkdtempSync(join(tmpdir(), 'geordi-test-trees-')), {
			repoPath: path,
			worktreeId: 'release-review'
		});
		// The checked-out worktree is deliberately missing the PR commit and has invalid local files.
		writeFileSync(join(worktree.path, sweet ? '.sweet.yml' : 'package.json'), 'unpublished!');
		const target = { number: '42', head, base, branch: 'main' };
		const review = await reviewRelease(worktree, target, () => true, false);
		expect(review).toMatchObject({
			problem: null,
			increases: (sweet ? ['api'] : ['api', 'client']).map((name) => ({
				name,
				before: '1.4.3',
				from: 'patch',
				after: '1.5.0',
				to: 'minor'
			}))
		});
		expect(await reviewRelease(worktree, target, () => true, false, review!.token)).toBeNull();
		expect(
			await reviewRelease(worktree, { ...target, base: initial }, () => true, false, review!.token)
		).toMatchObject({
			increases: (sweet ? ['api'] : ['api', 'client']).map((name) => ({
				name,
				from: 'none',
				before: '1.4.2',
				to: 'minor'
			}))
		});
		expect(
			await reviewRelease(worktree, { ...target, head: base, base: initial }, () => true, false)
		).toBeNull();
		note('already-minor', 'minor');
		expect(
			await reviewRelease(worktree, { ...target, base: commit() }, () => true, false)
		).toBeNull();
		const missing = await reviewRelease(worktree, target, () => false, false);
		expect(missing?.problem).toContain('Allow');
		expect(await reviewRelease(worktree, target, () => false, false, missing!.token)).toBeNull();
		const auto = await reviewRelease(worktree, target, () => false, true);
		expect(await reviewRelease(worktree, target, () => false, true, auto!.token)).toEqual(auto);
	});
}

it.each(['none', 'patch', 'minor', 'major'])('checks a major release with %s pending', (from) => {
	const previous = {
		name: 'api',
		path: '.',
		version: '1.4.2',
		bump: from,
		nextVersion: { none: null, patch: '1.4.3', minor: '1.5.0', major: '2.0.0' }[from] ?? null,
		problems: []
	};
	const next = { ...previous, bump: 'major', nextVersion: '2.0.0' };
	const increases = releaseIncreases([previous], [next]);
	if (from === 'major') expect(increases).toEqual([]);
	else expect(increases).toMatchObject([{ from, to: 'major', after: '2.0.0' }]);
});

it('skips a higher release level when the same next beta is already planned', () => {
	const pending = {
		path: '.',
		name: 'Geordi',
		version: '0.8.0-beta.0',
		nextVersion: '0.8.0-beta.1',
		bump: 'patch',
		problems: []
	};
	expect(releaseIncreases([pending], [{ ...pending, bump: 'minor' }])).toEqual([]);
});
