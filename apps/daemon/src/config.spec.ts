import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_SETTINGS } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { parseConfig, resolve, settingsOf } from './config.ts';
import { ensureWorktree } from './worktree.ts';

describe('parseConfig', () => {
	it('reads a single run command as a job of that name', () => {
		expect(parseConfig('run = "pnpm dev"')).toEqual({
			ports: 1, // one job, one port
			jobs: [{ name: 'run', command: 'pnpm dev', needs: [] }],
			urls: []
		});
		expect(parseConfig('')).toEqual({ ports: 10, jobs: [], urls: [] });
		expect(parseConfig('something = "else"').jobs).toEqual([]);
	});

	it('reads jobs with what they need, links with the jobs they lead to, and the number of ports', () => {
		const settings = parseConfig(`
			ports = 20
			[jobs.db]
			command = "docker compose up db"
			[jobs.web]
			command = "pnpm dev --port $PORT"
			needs = ["db"]
			[urls.app]
			url = "http://localhost:{web}/admin"
			[urls.docs]
			url = "http://docs.localhost:{web}/"
			needs = ["db"]
		`);
		expect(settings).toEqual({
			ports: 20,
			jobs: [
				{ name: 'db', command: 'docker compose up db', needs: [] },
				{ name: 'web', command: 'pnpm dev --port $PORT', needs: ['db'] }
			],
			urls: [
				// a job a link mentions is a job it needs
				{ name: 'app', url: 'http://localhost:{web}/admin', needs: ['web'] },
				{ name: 'docs', url: 'http://docs.localhost:{web}/', needs: ['web', 'db'] }
			]
		});
	});

	it('gives a workspace a port per job, unless more are asked for', () => {
		const three = '[jobs.a]\ncommand = "a"\n[jobs.b]\ncommand = "b"\n[jobs.c]\ncommand = "c"';
		expect(parseConfig(three).ports).toBe(3);
		expect(parseConfig(`ports = 8\n${three}`).ports).toBe(8);
		// never fewer than there are jobs, whatever was asked for
		expect(parseConfig(`ports = 2\n${three}`).ports).toBe(3);
		// and with no jobs to count, what any workspace gets
		expect(parseConfig('').ports).toBe(10);
	});

	it.each([
		['a run command that is not one', 'run = 5', /run/],
		['what is not TOML', 'run = ', /./],
		['a job without a command', '[jobs.web]\nneeds = []', /jobs\.web\.command/],
		['a job under a name that is none', '[jobs.Web_1]\ncommand = "x"', /not a job name/],
		['the same job twice', 'run = "a"\n[jobs.run]\ncommand = "b"', /same job/],
		[
			'a job that needs one there is not',
			'[jobs.web]\ncommand = "x"\nneeds = ["db"]',
			/no job "db"/
		],
		[
			'jobs that need each other',
			'[jobs.a]\ncommand = "a"\nneeds = ["b"]\n[jobs.b]\ncommand = "b"\nneeds = ["a"]',
			/needs itself/
		],
		['a link to a job there is not', '[urls.app]\nurl = "http://localhost:{web}/"', /no job "web"/],
		['a link that leads elsewhere', '[urls.app]\nurl = "https://example.com/"', /on this machine/],
		['a link that is no web address', '[urls.app]\nurl = "file:///etc/passwd"', /on this machine/],
		['a number of ports that is none', 'ports = 0', /ports/]
	])('refuses %s', (_, text, problem) => {
		expect(() => parseConfig(text)).toThrow(problem);
	});

	it('understands every setting agents are told about', () => {
		const { run, jobs, urls, ports, ...others } = CONFIG_SETTINGS;
		expect(others).toEqual({}); // a new setting wants parsing, and a place in this test
		expect(parseConfig(run.example).jobs).toEqual([
			{ name: 'run', command: 'pnpm dev --port $PORT', needs: [] }
		]);
		// the link's example leads to a job of the jobs' example
		expect(parseConfig([ports.example, jobs.example, urls.example].join('\n\n'))).toMatchObject({
			ports: 20,
			jobs: [{ name: 'db' }, { name: 'web' }],
			urls: [{ name: 'app', needs: ['web'] }]
		});
	});
});

describe('which file applies', () => {
	function setup(config?: string) {
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-config-')));
		const git = (...args: string[]) =>
			execFileSync('git', ['-C', repoPath, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
		git('init', '-q');
		if (config !== undefined) writeFileSync(join(repoPath, '.geordi.toml'), config);
		git('add', '.');
		git('commit', '-q', '--allow-empty', '-m', 'init');
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		return { repoPath, git, worktree: ensureWorktree(base, repoPath, 'abcdefgh-1') };
	}
	const run = (found: ReturnType<typeof settingsOf>) => found.settings?.jobs[0]?.command;

	it("the workspace's own", () => {
		const { repoPath, worktree } = setup('run = "pnpm dev"');
		expect(settingsOf(worktree, repoPath)).toMatchObject({ source: 'workspace', problem: null });

		writeFileSync(join(worktree.path, '.geordi.toml'), 'run = "pnpm dev --port 4000"');
		expect(run(settingsOf(worktree, repoPath))).toBe('pnpm dev --port 4000');
	});

	it('the one on the branch work starts from, where the workspace has none', () => {
		const { repoPath, git, worktree } = setup();
		expect(settingsOf(worktree, repoPath)).toEqual({ settings: null, problem: null, source: null });

		// the file arrives on the main branch after the workspace branched off
		writeFileSync(join(repoPath, '.geordi.toml'), 'run = "make serve"');
		git('add', '.');
		git('commit', '-qm', 'configure');
		const found = settingsOf(worktree, repoPath);
		expect(found.source).toBe('base');
		expect(run(found)).toBe('make serve');
	});

	it("says what is wrong with the workspace's file rather than falling back", () => {
		const { repoPath, worktree } = setup('run = "pnpm dev"');
		writeFileSync(join(worktree.path, '.geordi.toml'), 'run = [oops');
		expect(settingsOf(worktree, repoPath)).toEqual({
			settings: null,
			problem: expect.stringMatching(/^\.geordi\.toml: /),
			source: 'workspace'
		});

		rmSync(join(worktree.path, '.geordi.toml'));
		expect(run(settingsOf(worktree, repoPath))).toBe('pnpm dev');
	});
});

describe('resolve', () => {
	const settings = parseConfig(`
		[jobs.db]
		command = "db"
		[jobs.web]
		command = "web"
		needs = ["db"]
		[urls.app]
		url = "http://localhost:{web}/x?db={db}"
	`);
	const assigned = { blocks: [{ first: 20000, count: 10 }], jobs: { db: 0, web: 1 } };

	it("fills in the workspace's ports, and says which commands a person has agreed to", () => {
		const config = resolve(
			{ settings, problem: null, source: 'workspace' },
			assigned,
			(command) => command === 'db'
		);
		expect(config).toEqual({
			jobs: [
				{ name: 'db', command: 'db', needs: [], port: 20000, approved: true },
				{ name: 'web', command: 'web', needs: ['db'], port: 20001, approved: false }
			],
			urls: [{ name: 'app', href: 'http://localhost:20001/x?db=20000', needs: ['web', 'db'] }],
			ports: { first: 20000, count: 10 },
			problem: null,
			source: 'workspace'
		});
	});

	it('has ports to tell of even where the file says nothing', () => {
		const none = resolve({ settings: null, problem: null, source: null }, assigned, () => false);
		expect(none).toMatchObject({ jobs: [], urls: [], ports: { first: 20000, count: 10 } });
	});
});
