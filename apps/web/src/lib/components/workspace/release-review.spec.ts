import { beforeEach, expect, it, vi } from 'vitest';
import { enableWithReview, mergeWithReview, releaseReview } from './release-review.svelte.ts';
import { mergePull, setAutoMerge } from '../../../routes/workspaces.remote';

vi.mock('../../../routes/workspaces.remote', () => ({ mergePull: vi.fn(), setAutoMerge: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it('drops a canceled review and ignores repeat clicks on the pending merge', async () => {
	vi.mocked(mergePull).mockResolvedValueOnce({
		token: 'base-head',
		increases: [],
		problem: 'Unavailable'
	});
	const merge = mergeWithReview('w');
	await vi.waitFor(() => expect(releaseReview.asking?.token).toBe('base-head'));
	expect(await mergeWithReview('w')).toBeNull();
	releaseReview.asking!.answer('cancel');
	expect(await merge).toBeNull();
	expect(mergePull).toHaveBeenCalledTimes(1);
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
