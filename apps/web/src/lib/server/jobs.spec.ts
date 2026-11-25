import type { DaemonRequest, ForgeMessage, RepoConfig, Task } from '@geordi/protocol';
import { expect, it } from 'vitest';
import { createJobs } from './jobs.ts';
import { createTerminals } from './terminals.ts';

const task = (name: string, fields: Partial<Task>): Task => ({
	name,
	command: null,
	approved: true,
	ports: [],
	href: null,
	needs: [],
	default: false,
	...fields
});

function setup(tasks: Task[]) {
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
	const config: RepoConfig = {
		tasks,
		ports: null,
		source: 'workspace',
		file: '.geordi.yml',
		problem: null,
		setup: null,
		teardown: null
	};
	const checked: number[] = [];
	const state = { reachable: true };
	async function ask(request: DaemonRequest) {
		if (request.kind === 'config') return config;
		if (request.kind === 'jobPort') return null;
		if (request.kind === 'portReady') {
			checked.push(request.port);
			return request.port < 21102 || state.reachable;
		}
		throw new Error(request.kind);
	}
	const jobs = createJobs(terminals, ask as Parameters<typeof createJobs>[1], ref);
	return { jobs, started, checked, state };
}

it('shares prerequisites, waits for all their ports, and opens the first link', async () => {
	const { jobs, started, checked, state } = setup([
		task('web', {
			command: 'web',
			ports: [
				{ name: 'http', port: 21100 },
				{ name: 'live', port: 21101 }
			]
		}),
		task('preview', {
			needs: ['web'],
			href: 'http://localhost:21102/preview'
		}),
		task('worker', { command: 'worker', needs: ['web'] })
	]);
	expect((await jobs.list('w')).tasks.every((task) => !task.running)).toBe(true);
	const seen = { web: 'web', worker: 'worker' };
	const run = () => jobs.run('w', ['preview', 'worker'], seen);
	expect(await run()).toEqual([
		{ name: 'preview', href: 'http://localhost:21102/preview' },
		{ name: 'worker' }
	]);
	expect(started).toEqual(['web', 'worker']);
	expect(
		(await jobs.list('w')).tasks.filter((task) => task.running).map((task) => task.name)
	).toEqual(['web', 'worker']);
	// web is up once both its ports answer; the worker, with none, at once
	expect(checked).toEqual([21100, 21101, 21102]);

	state.reachable = false;
	expect(await run()).toEqual([
		{ name: 'preview', problem: expect.stringContaining('21102') },
		{ name: 'worker' }
	]);
	expect(started).toEqual(['web', 'worker']); // what runs is reused
});

it('opens the URL of a task that runs, and of one that needs nothing at once', async () => {
	const { jobs, started } = setup([
		task('storybook', {
			command: 'storybook',
			ports: [{ name: 'http', port: 21100 }],
			href: 'http://localhost:21100/'
		}),
		task('storybook-docs', { href: 'http://localhost:21100/docs', needs: ['storybook'] }),
		task('handbook', { href: 'http://localhost:21101/' })
	]);
	expect(await jobs.run('w', ['storybook-docs', 'handbook'], { storybook: 'storybook' })).toEqual([
		{ name: 'storybook-docs', href: 'http://localhost:21100/docs' },
		{ name: 'handbook', href: 'http://localhost:21101/' }
	]);
	expect(started).toEqual(['storybook']);
});

it('runs no command other than the one the person saw', async () => {
	const { jobs, started } = setup([task('web', { command: 'pnpm dev' })]);
	expect(await jobs.run('w', ['web'], { web: 'rm -rf /' })).toEqual([
		{ name: 'web', problem: expect.stringMatching(/^Review the command/) }
	]);
	expect(await jobs.run('w', ['gone'], {})).toEqual([
		{ name: 'gone', problem: 'There is no task "gone" any more' }
	]);
	expect(started).toEqual([]);
});
