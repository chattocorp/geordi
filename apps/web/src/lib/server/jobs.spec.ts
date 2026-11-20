import type { DaemonRequest, ForgeMessage, RepoConfig } from '@geordi/protocol';
import { expect, it } from 'vitest';
import { createJobs } from './jobs.ts';
import { createTerminals } from './terminals.ts';

it('shares prerequisites, checks URL ports and reuses running defaults', async () => {
	const ref = (worktreeId: string) => ({ worktreeId, repoPath: '/repo' });
	const started: string[] = [];
	const terminals = createTerminals(
		(message: ForgeMessage) => {
			if (message.type === 'terminal.open' && message.run) started.push(message.run.job);
			return true;
		},
		async () => null,
		ref
	);
	const tasks = [
		{ name: 'web', needs: [], default: false },
		{ name: 'preview', needs: ['web'], default: true },
		{ name: 'worker', needs: ['web'], default: true }
	];
	const config: RepoConfig = {
		tasks,
		jobs: ['web', 'worker'].map((name, i) => ({
			name,
			command: name,
			needs: name === 'worker' ? ['web'] : [],
			port: 21100 + i,
			approved: true
		})),
		urls: [
			{ name: 'web', needs: ['web'], href: 'http://localhost:21100/' },
			{ name: 'preview', needs: ['web'], href: 'http://localhost:21102/preview' }
		],
		ports: null,
		source: 'workspace',
		file: '.geordi.yml',
		problem: null,
		setup: null,
		teardown: null
	};
	const checked: number[] = [];
	let reachable = true;
	async function ask(request: DaemonRequest) {
		if (request.kind === 'config') return config;
		if (request.kind === 'jobPort') return null;
		if (request.kind === 'portReady') {
			checked.push(request.port);
			return request.port === 21100 || reachable;
		}
		throw new Error(request.kind);
	}
	const jobs = createJobs(terminals, ask as Parameters<typeof createJobs>[1], ref);
	const run = () => jobs.runTasks('w', ['preview', 'worker'], { web: 'web', worker: 'worker' });
	expect(await run()).toEqual([
		{ name: 'preview', href: 'http://localhost:21102/preview' },
		{ name: 'worker' }
	]);
	expect(started).toEqual(['web', 'worker']);
	expect(checked).toEqual([21100, 21102]);
	reachable = false;
	expect(await run()).toEqual([
		{ name: 'preview', problem: expect.stringContaining('21102') },
		{ name: 'worker' }
	]);
	expect(started).toEqual(['web', 'worker']);
});
