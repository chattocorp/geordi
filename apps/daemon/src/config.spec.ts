import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_SETTINGS } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { parseConfig, resolve, settingsOf, wantedPorts } from './config.ts';
import { ensureWorktree } from './worktree.ts';

const task = (fields: object) => ({
	command: null,
	ports: [],
	url: null,
	needs: [],
	default: false,
	...fields
});

describe('parseConfig', () => {
	it('takes a file that says nothing, and ignores what it does not know', () => {
		const nothing = { tasks: [], setup: null, teardown: null, sections: [] };
		expect(parseConfig('')).toEqual(nothing);
		expect(parseConfig('something: else')).toEqual(nothing);
		expect(() => parseConfig('- a list')).toThrow(/settings/);
	});

	it('reads tasks with their ports, URLs and what they need', () => {
		expect(
			parseConfig(`
tasks:
  db:
    command: docker compose up db
    ports: [postgres]
  web:
    label: Development server
    command: pnpm dev --port $PORT
    ports: [http, hmr]
    needs: [db]
    url: http://localhost:{http}/
    default: true
  reset:
    command: make reset
  docs:
    url: http://docs.localhost:{hmr}/
`).tasks
		).toEqual([
			task({ name: 'db', command: 'docker compose up db', ports: ['postgres'] }),
			task({
				name: 'web',
				label: 'Development server',
				command: 'pnpm dev --port $PORT',
				ports: ['http', 'hmr'],
				url: 'http://localhost:{http}/',
				needs: ['db'],
				default: true
			}),
			// a task without ports has none
			task({ name: 'reset', command: 'make reset' }),
			// a URL using a port only one other task lists needs that task
			task({
				name: 'docs',
				url: 'http://docs.localhost:{hmr}/',
				needs: ['web']
			})
		]);
	});

	it('reads the setup and teardown scripts', () => {
		expect(parseConfig('setup: pnpm install\nteardown: docker compose down')).toMatchObject({
			setup: 'pnpm install',
			teardown: 'docker compose down'
		});
		expect(() => parseConfig('setup: ""')).toThrow(/`setup` must be a command/);
	});

	it('says how what it used to read is said now', () => {
		for (const old of ['run: pnpm dev', 'jobs: {}', 'urls: {}', 'default: jobs.web', 'ports: 20'])
			expect(() => parseConfig(old)).toThrow(/no longer read: say what to run under `tasks`/);
	});

	it.each([
		['tasks: [web]', /`tasks` must be tasks/],
		['tasks:\n  Web: { command: x }', /not a task name/],
		['tasks:\n  setup: { command: x }', /for the setup script/],
		['tasks:\n  web: { label: x }', /needs a command, a url, or both/],
		['tasks:\n  web: { command: "" }', /command must be a command/],
		['tasks:\n  web: { command: x, ports: http }', /must be a list of port names/],
		['tasks:\n  web: { command: x, ports: [http, http] }', /names one twice/],
		['tasks:\n  web: { command: x, ports: [HTTP] }', /not a name/],
		['tasks:\n  web: { url: "http://localhost/", ports: [http] }', /only a task with a command/],
		['tasks:\n  web: { command: x, needs: [db] }', /there is no task "db"/],
		[
			'tasks:\n  web: { command: x, url: "http://localhost:{http}/" }',
			/no task lists a port "http"/
		],
		[
			'tasks:\n  dev: { command: x, ports: [http] }\n  preview: { command: x, ports: [http] }',
			/"http" is dev's already/
		],
		['tasks:\n  web: { url: "http://localhost:{web.http}/" }', /no task lists a port "web.http"/],
		['tasks:\n  web: { url: "https://example.com/" }', /on this machine/],
		['tasks:\n  web: { urls: { App: "http://localhost/" } }', /give each URL a task of its own/],
		['tasks:\n  web: { url: [http://localhost/] }', /must be an address/],
		['tasks:\n  web: { url: "http://localhost/", default: yes }', /default must be true or false/],
		[
			'tasks:\n  a: { command: x, needs: [b] }\n  b: { command: x, needs: [a] }',
			/needs itself, through other tasks/
		],
		['tasks:\n  web: { command: x, label: "" }', /label must be a non-empty/]
	])('refuses %j', (text, problem) => {
		expect(() => parseConfig(text)).toThrow(problem);
	});

	it('divides the repository into titled sections, in order', () => {
		expect(parseConfig('').sections).toEqual([]);
		expect(
			parseConfig(
				'sections:\n  - path: ./apps/web/\n    title: " Forge "\n  - path: docs\n    title: Docs'
			).sections
		).toEqual([
			{ path: 'apps/web', title: 'Forge' },
			{ path: 'docs', title: 'Docs' }
		]);
		// with tasks too
		expect(
			parseConfig('tasks:\n  web:\n    command: dev\nsections:\n  - path: web\n    title: Web')
				.sections
		).toEqual([{ path: 'web', title: 'Web' }]);
	});

	it('refuses sections that are not', () => {
		expect(() => parseConfig('sections: apps')).toThrow(/`sections` must be a list/);
		expect(() => parseConfig('sections:\n  - apps')).toThrow(/sections\[0\] must have a path/);
		for (const path of ['/etc', '../up', 'a/../b', '.', 'a//b', 'a\\\\b'])
			expect(() => parseConfig(`sections:\n  - path: "${path}"\n    title: T`)).toThrow(
				/sections\[0\]\.path must be a directory/
			);
		expect(() => parseConfig('sections:\n  - path: a\n')).toThrow(/sections\[0\]\.title must be/);
		expect(() =>
			parseConfig('sections:\n  - path: a\n    title: A\n  - path: a/\n    title: B')
		).toThrow(/sections\[1\]\.path: a is named twice/);
		expect(() =>
			parseConfig('sections:\n  - path: a\n    title: A\n    icon: ../logo.svg')
		).toThrow(/sections\[0\]\.icon must be a picture in the repository/);
		expect(
			parseConfig('sections:\n  - path: a\n    title: A\n    icon: ./a/logo.svg').sections
		).toEqual([{ path: 'a', title: 'A', icon: 'a/logo.svg' }]);
	});

	it('understands every setting agents are told about', () => {
		const { tasks, setup, teardown, sections, ...others } = CONFIG_SETTINGS;
		expect(others).toEqual({}); // a new setting wants parsing, and a place in this test
		expect(parseConfig(sections.example).sections).toEqual([
			{ path: 'apps/web', title: 'Web app', icon: 'apps/web/static/logo.svg' },
			{ path: 'apps/api', title: 'API' },
			{ path: 'docs', title: 'Documentation' }
		]);
		expect(parseConfig(tasks.example).tasks).toMatchObject([
			{ name: 'db', ports: ['postgres'] },
			{
				name: 'web',
				ports: ['http', 'hmr'],
				needs: ['db'],
				url: 'http://localhost:{http}/',
				default: true
			},
			{ name: 'admin', command: null, needs: ['web'] },
			{ name: 'seed', label: 'Data / Seed the database', command: 'pnpm db:seed' },
			{ name: 'reset', label: 'Data / Reset the database', command: 'pnpm db:reset' },
			{ name: 'docs', command: null, needs: [] }
		]);
		expect(parseConfig([setup.example, teardown.example].join('\n'))).toMatchObject({
			setup: 'pnpm install && cp ../.env .env',
			teardown: 'docker compose down --volumes'
		});
	});
});

describe('which file applies', () => {
	async function setup(config?: string) {
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-config-')));
		const git = (...args: string[]) =>
			execFileSync('git', ['-C', repoPath, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
		git('init', '-q');
		if (config !== undefined) writeFileSync(join(repoPath, '.geordi.yml'), config);
		git('add', '.');
		git('commit', '-q', '--allow-empty', '-m', 'init');
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-base-')));
		return {
			repoPath,
			git,
			worktree: await ensureWorktree(base, { repoPath, worktreeId: 'abcdefgh-1' })
		};
	}
	const says = (command: string) => `tasks:\n  run:\n    command: ${command}\n`;
	const run = (found: Awaited<ReturnType<typeof settingsOf>>) => found.settings?.tasks[0]?.command;

	it("the workspace's own", async () => {
		const { repoPath, worktree } = await setup(says('pnpm dev'));
		expect(await settingsOf(worktree, repoPath)).toMatchObject({
			source: 'workspace',
			problem: null,
			file: '.geordi.yml'
		});

		writeFileSync(join(worktree.path, '.geordi.yml'), says('pnpm dev --port 4000'));
		expect(run(await settingsOf(worktree, repoPath))).toBe('pnpm dev --port 4000');
	});

	it('the one on the branch work starts from, where the workspace has none', async () => {
		const { repoPath, git, worktree } = await setup();
		expect(await settingsOf(worktree, repoPath)).toEqual({
			settings: null,
			problem: null,
			source: null,
			file: null
		});

		// the file arrives on the main branch after the workspace branched off
		writeFileSync(join(repoPath, '.geordi.yml'), says('make serve'));
		git('add', '.');
		git('commit', '-qm', 'configure');
		const found = await settingsOf(worktree, repoPath);
		expect(found.source).toBe('base');
		expect(run(found)).toBe('make serve');
	});

	it("says what is wrong with the workspace's file rather than falling back", async () => {
		const { repoPath, worktree } = await setup(says('pnpm dev'));
		writeFileSync(join(worktree.path, '.geordi.yml'), 'tasks: [oops');
		expect(await settingsOf(worktree, repoPath)).toEqual({
			settings: null,
			problem: expect.stringMatching(/^\.geordi\.yml: /),
			source: 'workspace',
			file: '.geordi.yml'
		});

		rmSync(join(worktree.path, '.geordi.yml'));
		expect(run(await settingsOf(worktree, repoPath))).toBe('pnpm dev');
	});

	it('tells a workspace with a file by the old name to move it', async () => {
		const { repoPath, worktree } = await setup();
		writeFileSync(join(worktree.path, '.geordi.toml'), 'run = "pnpm dev"');
		expect(await settingsOf(worktree, repoPath)).toEqual({
			settings: null,
			problem: '.geordi.toml is no longer read: write its settings as YAML in .geordi.yml',
			source: 'workspace',
			file: '.geordi.toml'
		});
	});
});

describe('resolve', () => {
	const settings = parseConfig(`
setup: install
teardown: clean
tasks:
  web:
    command: pnpm dev
    ports: [http, live]
    url: http://localhost:{http}/admin
  api:
    command: pnpm api
    ports: [api]
  docs:
    url: http://localhost:{live}/docs
  site:
    url: http://localhost:{http}/
`);
	const found = { settings, problem: null, source: 'workspace' as const, file: '.geordi.yml' };
	const assigned = {
		blocks: [
			{ first: 20000, count: 3 },
			{ first: 24000, count: 10 }
		],
		jobs: { ':http': 0, ':live': 2, ':api': 1 },
		spare: 3
	};

	it("fills in the workspace's ports, and says which commands a person has agreed to", () => {
		const config = resolve(found, assigned, (command) => command !== 'pnpm api');
		expect(config.tasks).toEqual([
			{
				name: 'web',
				command: 'pnpm dev',
				approved: true,
				ports: [
					{ name: 'http', port: 20000 },
					{ name: 'live', port: 20002 }
				],
				href: 'http://localhost:20000/admin',
				needs: [],
				default: false
			},
			{
				name: 'api',
				command: 'pnpm api',
				approved: false,
				ports: [{ name: 'api', port: 20001 }],
				href: null,
				needs: [],
				default: false
			},

			{
				name: 'docs',
				command: null,
				approved: true,
				ports: [],
				href: 'http://localhost:20002/docs',
				needs: ['web'],
				default: false
			},
			{
				name: 'site',
				command: null,
				approved: true,
				ports: [],
				href: 'http://localhost:20000/',
				needs: ['web'],
				default: false
			}
		]);
		expect(config).toMatchObject({
			setup: { command: 'install', approved: true },
			teardown: { command: 'clean', approved: true },
			ports: { first: 24000, count: 10 }
		});
	});

	it('asks for each port by its name, once, where it was kept before', () => {
		expect(wantedPorts(settings)).toEqual([
			{ key: ':http', legacy: ['web.http', 'web'] },
			{ key: ':live', legacy: ['web.live'] },
			{ key: ':api', legacy: ['api.api', 'api'] }
		]);
		expect(wantedPorts(null)).toEqual([]);
	});

	it('has ports to tell of even where the file says nothing', () => {
		const nothing = { settings: null, problem: null, source: null, file: null };
		expect(
			resolve(nothing, { blocks: [{ first: 20000, count: 10 }], jobs: {}, spare: 0 }, () => true)
		).toEqual({
			tasks: [],
			setup: null,
			teardown: null,
			sections: [],
			ports: { first: 20000, count: 10 },
			problem: null,
			source: null,
			file: null
		});
	});
});
