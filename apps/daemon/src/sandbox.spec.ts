import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionOptions } from './agents/adapter.ts';
import type { PermissionMode } from '@geordi/protocol';
import { bubblewrap, canSandbox, sandboxed, sandboxPaths, seatbelt } from './sandbox.ts';

const home = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-sandbox-')));
const repo = join(home, 'Documents', 'repo');
mkdirSync(join(repo, '.git'), { recursive: true });
mkdirSync(join(home, 'Downloads'));
mkdirSync(join(home, 'session'));
writeFileSync(join(repo, 'README'), 'mine to read');
writeFileSync(join(home, 'Downloads', 'private'), 'not for agents');
writeFileSync(join(home, 'Documents', 'private'), 'not for agents');

const options = (permissionMode?: PermissionMode) =>
	({
		cwd: repo,
		dir: join(home, 'session'),
		writableRoots: [],
		settings: permissionMode ? { permissionMode } : {}
	}) as unknown as SessionOptions;

const start = (mode: PermissionMode | undefined, platform: NodeJS.Platform, possible: boolean) =>
	sandboxed('agent', ['acp'], options(mode), platform, home, possible);

describe('sandboxed', () => {
	it('sandboxes the sandboxed mode, and a workspace that never chose, where it can', () => {
		for (const mode of ['sandboxed', undefined] as const) {
			expect(start(mode, 'darwin', true).file).toBe('/usr/bin/sandbox-exec');
			expect(start(mode, 'linux', true).file).toBe('bwrap');
		}
	});

	it('leaves the other modes alone', () => {
		const plain = { file: 'agent', args: ['acp'] };
		for (const platform of ['darwin', 'linux'] as const) {
			expect(start('auto', platform, true)).toEqual(plain);
			expect(start('full-access', platform, true)).toEqual(plain);
		}
	});

	it('runs a workspace that never chose with full permissions where there is no sandbox', () => {
		expect(start(undefined, 'win32', false)).toEqual({ file: 'agent', args: ['acp'] });
	});

	it('never starts the sandboxed mode without its sandbox', () => {
		expect(() => start('sandboxed', 'win32', false)).toThrow(/can’t sandbox/);
	});

	it('allows where the agent works, even inside a guarded place', () => {
		const { deny, allow } = sandboxPaths(options('sandboxed'), home, 'darwin');
		expect(deny).toContain(join(home, 'Documents'));
		expect(deny).toContain('/Volumes');
		expect(allow).toContain(repo);
	});
});

describe('seatbelt', () => {
	it('passes paths as parameters, never as profile text', () => {
		const { args } = seatbelt({ deny: ['/a"b'], allow: ['/c)d'] }, { file: 'x', args: [] });
		const profile = args[args.indexOf('-p') + 1];
		expect(profile).not.toContain('/a"b');
		expect(profile).not.toContain('/c)d');
		expect(args.slice(0, 4)).toEqual(['-D', 'DENY0=/a"b', '-D', 'ALLOW0=/c)d']);
	});
});

describe('bubblewrap', () => {
	it('covers guarded places that exist, puts back what is allowed inside them, then makes the covers read-only', () => {
		const paths = sandboxPaths(options('sandboxed'), home, 'linux');
		const { args } = bubblewrap(paths, { file: 'agent', args: ['acp'] });
		const documents = join(home, 'Documents');
		const downloads = join(home, 'Downloads');
		expect(args).toEqual([
			'--dev-bind',
			'/',
			'/',
			'--tmpfs',
			documents,
			'--tmpfs',
			downloads,
			'--bind',
			repo,
			repo,
			'--remount-ro',
			documents,
			'--remount-ro',
			downloads,
			'--',
			'agent',
			'acp'
		]);
	});
});

describe.runIf(canSandbox())(`the sandbox on ${process.platform}`, () => {
	const run = (command: string, ...args: string[]) => {
		const { file, args: all } = sandboxed(command, args, options('sandboxed'), undefined, home);
		return spawnSync(file, all, { encoding: 'utf8' });
	};

	it('keeps guarded places out of reach', () => {
		for (const path of [join(home, 'Downloads', 'private'), join(home, 'Documents', 'private')])
			expect(run('/bin/cat', path).status).not.toBe(0);
		expect(run('/bin/sh', '-c', `echo x > ${join(home, 'Downloads', 'new')}`).status).not.toBe(0);
	});

	it('allows the repository, its writes, and everything else', () => {
		expect(run('/bin/cat', join(repo, 'README')).stdout).toBe('mine to read');
		expect(
			run('/bin/sh', '-c', `echo hi > ${join(repo, 'new')} && cat ${join(repo, 'new')}`).stdout
		).toBe('hi\n');
		expect(run('/bin/ls', '/usr/bin').status).toBe(0);
	});
});
