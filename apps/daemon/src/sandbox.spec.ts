import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionOptions } from './agents/adapter.ts';
import type { PermissionMode } from '@geordi/protocol';
import { sandboxed, sandboxPaths, sandboxProfile } from './sandbox.ts';

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

describe('sandboxed', () => {
	it('sandboxes the sandboxed mode on macOS, and a workspace that never chose', () => {
		for (const mode of ['sandboxed', undefined] as const)
			expect(sandboxed('agent', ['acp'], options(mode), 'darwin', home).file).toBe(
				'/usr/bin/sandbox-exec'
			);
	});

	it('leaves other modes and other systems alone', () => {
		const plain = { file: 'agent', args: ['acp'] };
		expect(sandboxed('agent', ['acp'], options('auto'), 'darwin', home)).toEqual(plain);
		expect(sandboxed('agent', ['acp'], options('full-access'), 'darwin', home)).toEqual(plain);
		expect(sandboxed('agent', ['acp'], options('sandboxed'), 'linux', home)).toEqual(plain);
	});

	it('passes paths as parameters, never as profile text', () => {
		const { profile, params } = sandboxProfile({ deny: ['/a"b'], allow: ['/c)d'] });
		expect(profile).not.toContain('/a"b');
		expect(profile).not.toContain('/c)d');
		expect(params).toEqual(['-D', 'DENY0=/a"b', '-D', 'ALLOW0=/c)d']);
	});

	it('allows where the agent works, even inside a guarded place', () => {
		const { deny, allow } = sandboxPaths(options('sandboxed'), home);
		expect(deny).toContain(join(home, 'Documents'));
		expect(allow).toContain(repo);
	});
});

describe.runIf(process.platform === 'darwin')('the sandbox on macOS', () => {
	const run = (command: string, ...args: string[]) => {
		const { file, args: all } = sandboxed(command, args, options('sandboxed'), 'darwin', home);
		return spawnSync(file, all, { encoding: 'utf8' });
	};

	it('denies guarded places as a plain permission error', () => {
		for (const path of [join(home, 'Downloads', 'private'), join(home, 'Documents', 'private')]) {
			const result = run('/bin/cat', path);
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('Operation not permitted');
		}
		expect(run('/bin/ls', '/Volumes').stderr).toContain('Operation not permitted');
	});

	it('allows the repository, its writes, and everything else', () => {
		expect(run('/bin/cat', join(repo, 'README')).stdout).toBe('mine to read');
		expect(
			run('/bin/sh', '-c', `echo hi > ${join(repo, 'new')} && cat ${join(repo, 'new')}`).stdout
		).toBe('hi\n');
		expect(run('/bin/ls', '/usr/bin').status).toBe(0);
	});
});
