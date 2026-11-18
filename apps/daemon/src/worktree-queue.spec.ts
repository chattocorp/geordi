import { expect, it } from 'vitest';
import { inWorktree } from './worktree-queue.ts';

it('orders operations by directory, including after failure', async () => {
	const gate = Promise.withResolvers<void>();
	const steps: string[] = [];
	const first = inWorktree('/shared', async () => {
		steps.push('create');
		await gate.promise;
		steps.push('created');
		throw new Error('setup failed');
	});
	const second = inWorktree('/shared', async () => {
		steps.push('restore');
	});
	await inWorktree('/other', async () => {
		steps.push('unrelated');
	});
	expect(steps).toEqual(['create', 'unrelated']);
	gate.resolve();
	await expect(first).rejects.toThrow('setup failed');
	await second;
	expect(steps).toEqual(['create', 'unrelated', 'created', 'restore']);
});
