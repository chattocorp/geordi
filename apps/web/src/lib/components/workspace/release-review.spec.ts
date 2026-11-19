import { beforeEach, expect, it, vi } from 'vitest';
import { enableWithReview, mergeWithReview, releaseReview } from './release-review.svelte.ts';
import { pullActionPending, runPullAction } from './review.svelte.ts';
import { mergePull, setAutoMerge } from '../../../routes/workspaces.remote';

vi.mock('../../../routes/workspaces.remote', () => ({ mergePull: vi.fn(), setAutoMerge: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it('drops a canceled review and ignores repeat clicks on the pending merge', async () => {
	vi.mocked(mergePull).mockResolvedValueOnce({
		token: 'base-head',
		increases: [],
		problem: 'Unavailable'
	});
	const merge = mergeWithReview('w', '42');
	await vi.waitFor(() => expect(releaseReview.asking?.token).toBe('base-head'));
	expect(await mergeWithReview('w', '42')).toBeNull();
	releaseReview.asking!.answer('cancel');
	expect(await merge).toBeNull();
	expect(mergePull).toHaveBeenCalledExactlyOnceWith({
		workspaceId: 'w',
		pullNumber: '42',
		confirmation: undefined
	});
});

it('retries an auto-merge check and submits the choice for the displayed revisions', async () => {
	vi.mocked(setAutoMerge)
		.mockResolvedValueOnce({ token: 'unavailable', increases: [], problem: 'Unavailable' })
		.mockResolvedValueOnce({ token: 'reviewed', increases: [], problem: null })
		.mockResolvedValueOnce(null);
	const result = enableWithReview('w', '42');
	await vi.waitFor(() => expect(releaseReview.asking?.auto).toBe(true));
	releaseReview.asking!.answer('retry');
	await vi.waitFor(() => expect(releaseReview.asking?.token).toBe('reviewed'));
	releaseReview.asking!.answer('confirm');
	await result;
	expect(setAutoMerge).toHaveBeenNthCalledWith(2, {
		workspaceId: 'w',
		pullNumber: '42',
		enabled: true,
		confirmation: undefined
	});
	expect(setAutoMerge).toHaveBeenLastCalledWith({
		workspaceId: 'w',
		pullNumber: '42',
		enabled: true,
		confirmation: 'reviewed'
	});
});

it('keeps a confirmed merge busy until the live view stops offering it', async () => {
	const action = { id: 'merge-pull', pullNumber: '42', label: 'Merge PR', icon: '' } as const;
	vi.mocked(mergePull).mockResolvedValueOnce('merged');
	const request = runPullAction('sidebar', action);
	expect(pullActionPending('sidebar', action)).toBe(true);
	await request;
	expect(pullActionPending('sidebar', action)).toBe(true);
	await runPullAction('sidebar', action);
	expect(mergePull).toHaveBeenCalledTimes(1);
	expect(pullActionPending('sidebar', { ...action, pullNumber: '43' })).toBe(false);
	expect(pullActionPending('sidebar', { ...action, id: 'archive' })).toBe(false);
});

it('offers the merge again when the command fails', async () => {
	const action = { id: 'merge-pull', pullNumber: '42', label: 'Merge PR', icon: '' } as const;
	vi.mocked(mergePull).mockRejectedValueOnce(new Error('Merge blocked'));
	await runPullAction('retry', action);
	expect(pullActionPending('retry', action)).toBe(false);
});
