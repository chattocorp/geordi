import { expect, it, vi } from 'vitest';
import { turnStarts } from './turn-starts.ts';
import { ensureWorktree, fetchUpstream, hasWorktree } from './worktree.ts';
import type { Session } from './session.ts';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('./worktree.ts', () => ({
	worktreePath: () => '/worktree',
	verifyLinks: vi.fn(),
	hasWorktree: vi.fn(),
	fetchUpstream: vi.fn(),
	ensureWorktree: vi.fn()
}));

it.each(['close', 'fetch', 'worktree', 'setup', 'config'])(
	'honors Stop during %s and starts the next turn',
	async (stage) => {
		const gate = Promise.withResolvers<null>();
		const entered = Promise.withResolvers<void>();
		const sessions = new Map<string, Session>();
		const setups = new Map<string, Promise<string | null>>();
		const begin = vi.fn();
		const emit = vi.fn();
		const { beginning, startMessage } = turnStarts({
			worktreesDir: '/trees',
			projectsDir: '/projects',
			sessions,
			setups,
			apiUrl: '',
			prepared: vi.fn(),
			emitFor: () => emit,
			begin,
			configFor: async () => {
				if (stage === 'config') {
					entered.resolve();
					await gate.promise;
				}
				return { env: {} };
			}
		});
		const message = {
			type: 'agent.message',
			agent: 'codex',
			settings: {},
			repoPath: '/repo',
			worktreeId: 'tree',
			workspaceId: 'w',
			apiToken: '',
			resumeId: null,
			prompt: 'first'
		} as const;
		if (stage === 'close')
			sessions.set('w', {
				options: { settings: { model: 'old' } },
				over: () => false,
				working: () => false,
				close: entered.resolve,
				done: gate.promise
			} as unknown as Session);
		if (stage === 'setup') {
			setups.set('tree', gate.promise);
			vi.spyOn(setups, 'get').mockImplementation(() => {
				entered.resolve();
				return gate.promise;
			});
		}
		vi.mocked(hasWorktree).mockReturnValue(stage !== 'fetch');
		vi.mocked(fetchUpstream).mockImplementation(() => {
			entered.resolve();
			return gate.promise;
		});
		vi.mocked(ensureWorktree).mockImplementation(async () => ({
			path: '/worktree',
			adminDir: '',
			commonDir: '',
			writableRoots: [],
			branch: 'main',
			created: false,
			restored: false
		}));
		const stop = () => {
			void startMessage({ ...message, prompt: 'steer' });
			beginning.get('w')?.stop();
			beginning.get('w')?.stop();
		};
		if (stage === 'worktree') {
			const ensure = vi.mocked(ensureWorktree).getMockImplementation()!;
			vi.mocked(ensureWorktree).mockImplementationOnce(async (...args) => {
				entered.resolve();
				await gate.promise;
				return ensure(...args);
			});
		}
		const first = startMessage(message);
		await entered.promise;
		stop();
		sessions.clear();
		await first;
		gate.resolve(null);
		expect(emit.mock.calls).toEqual([[{ kind: 'turn.failed', error: 'Stopped' }]]);
		expect(begin).not.toHaveBeenCalled();
		expect(beginning.size).toBe(0);
		await startMessage({ ...message, prompt: 'next' });
		expect(begin).toHaveBeenCalledExactlyOnceWith('w', expect.anything(), [
			{ prompt: 'next', deliveryId: undefined }
		]);
	}
);

it('starts a project in a folder of its own, without a worktree or its configuration', async () => {
	const projectsDir = mkdtempSync(join(tmpdir(), 'projects-'));
	const begin = vi.fn();
	const configFor = vi.fn();
	const prepared = vi.fn();
	const { startMessage } = turnStarts({
		worktreesDir: '/trees',
		projectsDir,
		sessions: new Map(),
		setups: new Map(),
		apiUrl: '',
		prepared,
		emitFor: () => vi.fn(),
		begin,
		configFor
	});
	const projectId = '00000000-0000-4000-8000-000000000001';
	vi.mocked(ensureWorktree).mockClear();
	await startMessage({
		type: 'agent.message',
		agent: 'claude',
		settings: {},
		project: true,
		worktreeId: projectId,
		workspaceId: projectId,
		apiToken: '',
		resumeId: null,
		prompt: 'orchestrate'
	});
	const path = join(projectsDir, projectId);
	expect(existsSync(path)).toBe(true);
	expect(ensureWorktree).not.toHaveBeenCalled();
	expect(configFor).not.toHaveBeenCalled();
	expect(prepared).not.toHaveBeenCalled();
	expect(begin).toHaveBeenCalledExactlyOnceWith(
		projectId,
		expect.objectContaining({
			options: expect.objectContaining({ cwd: path, env: {}, writableRoots: [] })
		}),
		[{ prompt: 'orchestrate', deliveryId: undefined }]
	);
});
