import { JOB_TERMINAL } from '@geordi/protocol';
import { expect, it, vi } from 'vitest';
import { archiveWorkspace, concernsAboutArchiving, terminals, workspaces } from './app.ts';

const { send, request } = vi.hoisted(() => ({
	send: vi.fn(() => true),
	request: vi.fn(async () => true)
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
