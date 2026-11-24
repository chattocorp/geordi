import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RepositoryRelease } from '@geordi/protocol';
import { expect, it } from 'vitest';
import { watchRepositoryReleases } from './repository-releases.ts';

it('reads Changesets from the repository base, including packages bumped together', async () => {
	const path = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-repository-release-')));
	const git = (...args: string[]) =>
		execFileSync('git', [
			'-C',
			path,
			'-c',
			'user.name=test',
			'-c',
			'user.email=test@example.org',
			...args
		]);
	const write = (file: string, body: string) => writeFileSync(join(path, file), body);
	const reports: RepositoryRelease[] = [];
	const allowed = new Set<string>();
	const watches = watchRepositoryReleases(
		{
			has: (_, command) => allowed.has(command),
			add: (_, command) => {
				allowed.add(command);
			}
		},
		(_, result) => reports.push(result)
	);
	try {
		git('init', '-qb', 'stable');
		mkdirSync(join(path, '.changeset'));
		write('.changeset/config.json', JSON.stringify({ fixed: [['api', 'client']] }));
		write(
			'package.json',
			JSON.stringify({ name: 'example', private: true, workspaces: ['packages/*'] })
		);
		write('pnpm-workspace.yaml', 'packages: ["packages/*"]\n');
		for (const name of ['api', 'client']) {
			mkdirSync(join(path, 'packages', name), { recursive: true });
			write('packages/' + name + '/package.json', JSON.stringify({ name, version: '1.4.0' }));
		}
		write('.changeset/export.md', '---\n"api": minor\n---\nExport results.\n');
		git('add', '.');
		git('commit', '-qm', 'base');
		git('update-ref', 'refs/remotes/origin/stable', 'HEAD');
		git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/stable');
		git('switch', '-qc', 'feature');
		write('.changeset/feature.md', '---\n"api": major\n---\nWorkspace only.\n');
		git('add', '.');
		git('commit', '-qm', 'workspace only');
		write('package.json', 'uncommitted edit');
		watches.set([path]);
		await watches.refresh(path);
		const command = reports.at(-1)?.plan?.ask;
		expect(command).toBeTruthy();
		expect(reports.at(-1)?.plan?.packages).toEqual([]);
		await watches.refresh(path, command!);
		const release = reports.at(-1)!;
		expect(release.branch).toBe('stable');
		expect(
			release.plan?.packages
				.map((pkg) => [pkg.name, pkg.nextVersion, pkg.notes.map((note) => note.body)])
				.sort()
		).toEqual([
			['api', '1.5.0', ['Export results.']],
			['client', '1.5.0', []]
		]);
		git('update-ref', 'refs/remotes/origin/stable', 'HEAD');
		await expect
			.poll(() => reports.at(-1)?.plan?.packages.find((pkg) => pkg.name === 'api')?.nextVersion, {
				timeout: 3000
			})
			.toBe('2.0.0');
	} finally {
		watches.set([]);
		rmSync(path, { recursive: true, force: true });
	}
});
