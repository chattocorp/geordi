import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_SETTINGS } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { parseConfig, resolve, settingsOf } from './config.ts';
import { ensureWorktree } from './worktree.ts';

/** As a `.geordi.toml` says it: what the file was first, and is still read as. */
const toml = (text: string) => parseConfig(text, '.geordi.toml');

describe('parseConfig, of TOML', () => {
	it('reads a single run command as a job of that name', () => {
		expect(toml('run = "pnpm dev"')).toEqual({
			ports: 1, // one job, one port
			jobs: [{ name: 'run', command: 'pnpm dev', needs: [] }],
			urls: [],
			setup: null,
			teardown: null
		});
		expect(toml('')).toEqual({
			ports: 10,
			jobs: [],
			urls: [],
			setup: null,
			teardown: null
		});
		expect(toml('something = "else"').jobs).toEqual([]);
	});

	it('reads jobs with what they need, links with the jobs they lead to, and the number of ports', () => {
		const settings = toml(`
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
			],
			setup: null,
			teardown: null
		});
	});

	it('reads the setup and teardown scripts', () => {
		expect(toml('setup = " pnpm install "\nteardown = "docker compose down"')).toMatchObject({
			setup: 'pnpm install',
			teardown: 'docker compose down',
			jobs: []
		});
	});

	it('gives a workspace a port per job, unless more are asked for', () => {
		const three = '[jobs.a]\ncommand = "a"\n[jobs.b]\ncommand = "b"\n[jobs.c]\ncommand = "c"';
		expect(toml(three).ports).toBe(3);
		expect(toml(`ports = 8\n${three}`).ports).toBe(8);
		// never fewer than there are jobs, whatever was asked for
		expect(toml(`ports = 2\n${three}`).ports).toBe(3);
		// and with no jobs to count, what any workspace gets
		expect(toml('').ports).toBe(10);
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
		['a number of ports that is none', 'ports = 0', /ports/],
		['a setup script that is no command', 'setup = ""', /setup/],
		['a teardown script that is no command', 'teardown = ["x"]', /teardown/],
		['a job named like a script', '[jobs.setup]\ncommand = "x"', /setup script/]
	])('refuses %s', (_, text, problem) => {
		expect(() => toml(text)).toThrow(problem);
	});
});

describe('parseConfig, of YAML', () => {
	it('reads the same settings, said the other way', () => {
		expect(parseConfig('run: pnpm dev')).toEqual(toml('run = "pnpm dev"'));
		const yaml = parseConfig(`
ports: 4
setup: pnpm install
jobs:
  db:
    command: docker compose up db
  web:
    command: pnpm dev --port $PORT
    needs: [db]
urls:
  app:
    url: http://localhost:{web}/
    needs:
      - db
`);
		expect(yaml).toEqual(
			toml(`
ports = 4
setup = "pnpm install"
[jobs.db]
command = "docker compose up db"
[jobs.web]
command = "pnpm dev --port $PORT"
needs = ["db"]
[urls.app]
url = "http://localhost:{web}/"
needs = ["db"]
`)
		);
		expect(yaml.jobs).toEqual([
			{ name: 'db', command: 'docker compose up db', needs: [] },
			{ name: 'web', command: 'pnpm dev --port $PORT', needs: ['db'] }
		]);
	});

	it('takes a file that says nothing, and ignores what it does not know', () => {
		for (const nothing of ['', '# nothing yet\n', '---\n'])
			expect(parseConfig(nothing)).toMatchObject({ jobs: [], ports: 10 });
		expect(parseConfig('something: else').jobs).toEqual([]);
	});

	it.each([
		['what is not YAML', 'run: [oops', /./],
		['what is not settings', '- run\n- jobs', /settings/],
		['a single word', 'pnpm dev', /settings/],
		['a run command that is not one', 'run: 5', /run/],
		['a number of ports that is a word', 'ports: "3"', /ports/],
		['a job without a command', 'jobs:\n  web:\n    needs: []', /jobs\.web\.command/],
		[
			'a link that leads elsewhere',
			'urls:\n  app:\n    url: https://example.com/',
			/on this machine/
		]
	])('refuses %s', (_, text, problem) => {
		expect(() => parseConfig(text)).toThrow(problem);
	});

	it('understands every setting agents are told about', () => {
		const { run, jobs, urls, ports, setup, teardown, ...others } = CONFIG_SETTINGS;
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
		expect(parseConfig([setup.example, teardown.example].join('\n'))).toMatchObject({
			setup: 'pnpm install && cp ../.env .env',
			teardown: 'docker compose down --volumes'
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
		expect(settingsOf(worktree, repoPath)).toMatchObject({
			source: 'workspace',
			problem: null,
			file: '.geordi.toml'
		});

		writeFileSync(join(worktree.path, '.geordi.toml'), 'run = "pnpm dev --port 4000"');
		expect(run(settingsOf(worktree, repoPath))).toBe('pnpm dev --port 4000');
	});

	it('the one on the branch work starts from, where the workspace has none', () => {
		const { repoPath, git, worktree } = setup();
		expect(settingsOf(worktree, repoPath)).toEqual({
			settings: null,
			problem: null,
			source: null,
			file: null
		});

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
			source: 'workspace',
			file: '.geordi.toml'
		});

		rmSync(join(worktree.path, '.geordi.toml'));
		expect(run(settingsOf(worktree, repoPath))).toBe('pnpm dev');
	});

	it('the YAML one, where there is one of each', () => {
		const { repoPath, git, worktree } = setup('run = "from toml"');
		expect(run(settingsOf(worktree, repoPath))).toBe('from toml');

		writeFileSync(join(worktree.path, '.geordi.yml'), 'run: from yaml');
		expect(settingsOf(worktree, repoPath)).toMatchObject({
			source: 'workspace',
			file: '.geordi.yml',
			settings: { jobs: [{ command: 'from yaml' }] }
		});

		// a workspace's file of either name comes before the main branch's of either
		rmSync(join(worktree.path, '.geordi.yml'));
		rmSync(join(worktree.path, '.geordi.toml'));
		writeFileSync(join(repoPath, '.geordi.yml'), 'run: main yaml');
		git('add', '.');
		git('commit', '-qm', 'configure in YAML');
		expect(settingsOf(worktree, repoPath)).toMatchObject({ source: 'base', file: '.geordi.yml' });
		expect(run(settingsOf(worktree, repoPath))).toBe('main yaml');

		writeFileSync(join(worktree.path, '.geordi.yml'), 'run: [oops');
		expect(settingsOf(worktree, repoPath).problem).toMatch(/^\.geordi\.yml: /);
	});
});

describe('resolve', () => {
	const settings = toml(`
		setup = "install"
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
			{ settings, problem: null, source: 'workspace', file: '.geordi.yml' },
			assigned,
			(command) => command === 'db'
		);
		expect(config).toEqual({
			jobs: [
				{ name: 'db', command: 'db', needs: [], port: 20000, approved: true },
				{ name: 'web', command: 'web', needs: ['db'], port: 20001, approved: false }
			],
			urls: [{ name: 'app', href: 'http://localhost:20001/x?db=20000', needs: ['web', 'db'] }],
			setup: { command: 'install', approved: false },
			teardown: null,
			ports: { first: 20000, count: 10 },
			problem: null,
			source: 'workspace',
			file: '.geordi.yml'
		});
	});

	it('has ports to tell of even where the file says nothing', () => {
		const none = resolve(
			{ settings: null, problem: null, source: null, file: null },
			assigned,
			() => false
		);
		expect(none).toMatchObject({
			jobs: [],
			urls: [],
			setup: null,
			ports: { first: 20000, count: 10 }
		});
	});
});

describe('display labels', () => {
	it.each([
		[
			'yaml',
			'jobs:\n  web:\n    label: "  Web app  "\n    command: serve\nurls:\n  app:\n    label: "  Open app  "\n    url: http://localhost:{web}/',
			'.geordi.yml'
		],
		[
			'toml',
			'[jobs.web]\nlabel = "  Web app  "\ncommand = "serve"\n[urls.app]\nlabel = "  Open app  "\nurl = "http://localhost:{web}/"',
			'.geordi.toml'
		]
	])('preserves keys, ports and approvals with %s labels', (_, text, file) => {
		const settings = parseConfig(text, file);
		const config = resolve(
			{ settings, problem: null, source: 'workspace', file },
			{ blocks: [{ first: 20000, count: 1 }], jobs: { web: 0 } },
			(command) => command === 'serve'
		);
		expect(config.jobs).toEqual([
			{ name: 'web', label: 'Web app', command: 'serve', needs: [], port: 20000, approved: true }
		]);
		expect(config.urls).toEqual([
			{ name: 'app', label: 'Open app', href: 'http://localhost:20000/', needs: ['web'] }
		]);
	});

	it.each([null, 42, true, [], {}, '', '   ', 'a\nb', 'a\tb', 'x'.repeat(101)])(
		'rejects invalid labels: %j',
		(label) => {
			for (const section of ['jobs', 'urls']) {
				const entry =
					section === 'jobs' ? { command: 'serve' } : { url: 'http://localhost:20000/' };
				expect(() =>
					parseConfig(JSON.stringify({ [section]: { app: { ...entry, label } } }))
				).toThrow(`${section}.app.label`);
			}
		}
	);

	it('accepts labels at the length limit and lets different keys share a label', () => {
		const config = parseConfig(
			JSON.stringify({
				jobs: {
					web: { command: 'serve', label: 'x'.repeat(100) },
					other: { command: 'other', label: 'x'.repeat(100), needs: ['web'] }
				}
			})
		);
		expect(config.jobs.map(({ name, needs }) => ({ name, needs }))).toEqual([
			{ name: 'web', needs: [] },
			{ name: 'other', needs: ['web'] }
		]);
	});
});
