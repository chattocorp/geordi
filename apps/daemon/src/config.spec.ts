import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configOf, parseConfig } from './config.ts';
import { ensureWorktree } from './worktree.ts';

describe('parseConfig', () => {
	it('reads the run command, and takes its absence for none', () => {
		expect(parseConfig('run = "pnpm dev"')).toEqual({ run: 'pnpm dev' });
		expect(parseConfig('')).toEqual({ run: null });
		expect(parseConfig('something = "else"')).toEqual({ run: null });
	});

	it('refuses what is not a command, or not TOML', () => {
		expect(() => parseConfig('run = 5')).toThrow(/run/);
		expect(() => parseConfig('run = ')).toThrow();
	});
});

describe('configOf', () => {
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

	it("goes by the workspace's own file", () => {
		const { repoPath, worktree } = setup('run = "pnpm dev"');
		expect(configOf(worktree, repoPath)).toEqual({
			run: 'pnpm dev',
			problem: null,
			source: 'workspace'
		});

		writeFileSync(join(worktree.path, '.geordi.toml'), 'run = "pnpm dev --port 4000"');
		expect(configOf(worktree, repoPath).run).toBe('pnpm dev --port 4000');
	});

	it('goes by the branch work starts from where the workspace has no file', () => {
		const { repoPath, git, worktree } = setup();
		expect(configOf(worktree, repoPath)).toEqual({ run: null, problem: null, source: null });

		// the file arrives on the main branch after the workspace branched off
		writeFileSync(join(repoPath, '.geordi.toml'), 'run = "make serve"');
		git('add', '.');
		git('commit', '-qm', 'configure');
		expect(configOf(worktree, repoPath)).toMatchObject({ run: 'make serve', source: 'base' });
	});

	it("says what is wrong with the workspace's file rather than falling back", () => {
		const { repoPath, worktree } = setup('run = "pnpm dev"');
		writeFileSync(join(worktree.path, '.geordi.toml'), 'run = [oops');
		expect(configOf(worktree, repoPath)).toEqual({
			run: null,
			problem: expect.stringMatching(/^\.geordi\.toml: /),
			source: 'workspace'
		});

		rmSync(join(worktree.path, '.geordi.toml'));
		expect(configOf(worktree, repoPath).run).toBe('pnpm dev');
	});
});
