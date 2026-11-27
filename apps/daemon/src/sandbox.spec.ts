import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionOptions } from './agents/adapter.ts';
import { permissionModeOf, type PermissionMode } from '@geordi/protocol';
import { bubblewrap, canSandbox, sandboxed, sandboxPaths, seatbelt } from './sandbox.ts';

const home = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-sandbox-')));
const repo = join(home, 'Documents', 'repo');
mkdirSync(join(repo, '.git'), { recursive: true });
mkdirSync(join(home, 'Downloads'));
mkdirSync(join(home, 'session'));
writeFileSync(join(repo, 'README'), 'mine to read');
writeFileSync(join(home, 'Downloads', 'private'), 'not for agents');
writeFileSync(join(home, 'Documents', 'private'), 'not for agents');

const options = (permissionMode?: PermissionMode, more: Partial<SessionOptions> = {}) =>
	({
		cwd: repo,
		dir: join(home, 'session'),
		writableRoots: [],
		settings: permissionMode ? { permissionMode } : {},
		...more
	}) as unknown as SessionOptions;

const start = (mode: PermissionMode | undefined, platform: NodeJS.Platform) =>
	sandboxed('agent', ['acp'], options(mode), platform, home);

describe('the permission mode', () => {
	it('is sandboxed for a workspace that never chose, where the computer can sandbox', () => {
		expect(permissionModeOf({}, true)).toBe('sandboxed');
		expect(permissionModeOf({}, false)).toBe('full-access');
		expect(permissionModeOf({ permissionMode: 'auto' }, true)).toBe('auto');
	});
});

describe('sandboxed', () => {
	it('sandboxes the sandboxed mode', () => {
		expect(start('sandboxed', 'darwin').file).toBe('/usr/bin/sandbox-exec');
		expect(start('sandboxed', 'linux').file).toBe('bwrap');
	});

	it('leaves the other modes alone', () => {
		const plain = { file: 'agent', args: ['acp'] };
		for (const platform of ['darwin', 'linux', 'win32'] as const) {
			expect(start('auto', platform)).toEqual(plain);
			expect(start('full-access', platform)).toEqual(plain);
		}
	});

	it('never starts the sandboxed mode without its sandbox', () => {
		expect(() => start('sandboxed', 'win32')).toThrow(/can’t sandbox/);
	});
});

describe.skipIf(process.platform === 'win32')('sandboxPaths', () => {
	it('allows where the agent works, even inside a guarded place', () => {
		const { deny, allow } = sandboxPaths(options('sandboxed'), home, 'darwin');
		expect(deny).toContain(join(home, 'Documents'));
		expect(deny).toContain('/Volumes');
		expect(allow).toContain(repo);
	});

	it('allows the repository and its Git directory, not the folder they are in', () => {
		const gitDir = join(home, 'Documents', 'project.git');
		const { allow } = sandboxPaths(
			options('sandboxed', {
				repoPath: join(home, 'Documents', 'project'),
				worktree: {
					path: repo,
					branch: 'b',
					adminDir: join(gitDir, 'worktrees', 'r'),
					commonDir: gitDir
				}
			}),
			home,
			'darwin'
		);
		expect(allow).toContain(gitDir);
		expect(allow).toContain(join(home, 'Documents', 'project'));
		expect(allow).not.toContain(join(home, 'Documents'));
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
		const documents = join(home, 'Documents');
		const downloads = join(home, 'Downloads');
		const paths = {
			deny: [documents, downloads, join(home, 'Missing')],
			allow: [repo, join(home, 'session')]
		};
		expect(bubblewrap(paths, { file: 'agent', args: ['acp'] }).args).toEqual([
			'--dev-bind',
			'/',
			'/',
			'--unshare-pid',
			'--proc',
			'/proc',
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

	it.runIf(process.platform === 'linux')('keeps them out of reach through other processes', () => {
		const through = `/proc/${process.pid}/root${join(home, 'Downloads', 'private')}`;
		expect(run('/bin/cat', through).status).not.toBe(0);
	});

	it('allows the repository, its writes, and everything else', () => {
		expect(run('/bin/cat', join(repo, 'README')).stdout).toBe('mine to read');
		expect(
			run('/bin/sh', '-c', `echo hi > ${join(repo, 'new')} && cat ${join(repo, 'new')}`).stdout
		).toBe('hi\n');
		expect(run('/bin/ls', '/usr/bin').status).toBe(0);
	});
});
