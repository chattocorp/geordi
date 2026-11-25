import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JOB_TERMINAL } from '@geordi/protocol';
import { expect, it, vi } from 'vitest';
import {
	archiveWorkspace,
	concernsAboutArchiving,
	removeRepository,
	repos,
	terminals,
	workspaces
} from './app.ts';

const { send, request } = vi.hoisted(() => ({
	send: vi.fn(() => true),
	request: vi.fn<() => Promise<unknown>>(async () => true)
}));

vi.mock('./daemons.ts', async (original) => ({
	...(await original<typeof import('./daemons.ts')>()),
	createHub: () => ({ send, request })
}));
vi.mock('./secret.ts', () => ({ loadSecret: () => 'test' }));
vi.mock('./events/index.ts', async (original) => {
	const events = await original<typeof import('./events/index.ts')>();
	const store = new events.EventStore(':memory:');
	return { ...events, store: () => store };
});

it('archives an idle workspace and closes its shell and task without confirmation', async () => {
	const id = workspaces().create({ repoId: null, agent: 'codex', prompt: '' });
	const shell = id + ':shell';
	const task = id + ':' + JOB_TERMINAL + 'web';
	terminals().opened(shell);
	terminals().opened(task, { job: 'web', command: 'pnpm dev' });

	const preview = await concernsAboutArchiving(id);
	expect(preview).toEqual({ concerns: [], discard: false, stopAgents: false });
	expect(request).not.toHaveBeenCalled();
	await archiveWorkspace(id, preview.discard, null, preview.stopAgents);
	expect(send).toHaveBeenCalledWith({ type: 'terminal.close', terminalId: shell });
	expect(send).toHaveBeenCalledWith({ type: 'terminal.close', terminalId: task });
	expect(workspaces().summary(id).archivedAt).not.toBeNull();
});

it('mentions running processes when a busy agent needs confirmation', async () => {
	const id = workspaces().create({ repoId: null, agent: 'codex', prompt: 'Build' });
	terminals().opened(id + ':shell');
	expect(await concernsAboutArchiving(id)).toEqual({
		concerns: ['Busy agents will be stopped.', 'Running processes will be stopped.'],
		discard: false,
		stopAgents: true
	});
});

it('removes a repository with a shared worktree, preserving its conversations', async () => {
	const checkout = mkdtempSync(join(tmpdir(), 'geordi-archive-preview-'));
	execFileSync('git', ['init', '-q', checkout]);
	const repo = repos().register(checkout);
	rmSync(checkout, { recursive: true });
	const domain = workspaces();
	const id = domain.create({ repoId: repo.id, agent: 'codex', prompt: 'Review' });
	const helper = domain.agents.start(id, { worktree: 'shared', prompt: 'Read' }).id;
	domain.record(id, { kind: 'worktree', path: '/workspace', branch: 'review' });
	domain.record(helper, { kind: 'turn.completed' });
	domain.record(id, { kind: 'turn.completed' });
	const job = id + ':' + JOB_TERMINAL + 'web';
	terminals().opened(job, { job: 'web', command: 'pnpm dev' });
	domain.lock(id, true);
	await expect(removeRepository(repo.id)).rejects.toMatchObject({ status: 409 });
	domain.lock(id, false);
	request.mockRejectedValueOnce(new Error('No daemon connected'));
	await expect(removeRepository(repo.id)).rejects.toMatchObject({
		body: { message: 'No daemon connected' }
	});
	expect(repos().get(repo.id)).toBeDefined();
	expect(domain.summary(id).archivedAt).toBeNull();
	const cleanup = Promise.withResolvers<{ branch: null }>();
	request.mockReturnValueOnce(cleanup.promise);
	const removal = removeRepository(repo.id);
	expect(() => domain.create({ repoId: repo.id, agent: 'codex', prompt: '' })).toThrow();
	cleanup.resolve({ branch: null });
	await removal;
	expect(request).toHaveBeenLastCalledWith(
		expect.objectContaining({
			kind: 'removeWorktree',
			worktreeId: id,
			removingRepository: true,
			force: true
		}),
		expect.any(Number)
	);
	expect(() => repos().get(repo.id)).toThrow();
	expect(send).toHaveBeenCalledWith({ type: 'terminal.close', terminalId: job });
	expect(domain.list(repo.id)).toEqual([]);
	expect(domain.summary(helper).archivedAt).toBeTruthy();
});
