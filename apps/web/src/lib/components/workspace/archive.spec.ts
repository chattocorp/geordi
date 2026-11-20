import { beforeEach, expect, it, vi } from 'vitest';
import { archive, archiving } from './archive.svelte.ts';
import { archiveWorkspace, previewArchive } from '../../../routes/workspaces.remote';

vi.mock('../../../routes/workspaces.remote', () => ({
	archiveWorkspace: vi.fn(),
	previewArchive: vi.fn()
}));

beforeEach(() => vi.clearAllMocks());

it('checks once without opening a dialog and archives a clean workspace', async () => {
	vi.mocked(previewArchive).mockResolvedValueOnce({
		concerns: [],
		discard: false,
		stopAgents: false
	});
	const result = archive('w', 'Workspace');
	expect(archiving.asking).toBeNull();
	expect(await archive('w', 'Workspace')).toBe(false);
	expect(await result).toBe(true);
	expect(archiveWorkspace).toHaveBeenCalledExactlyOnceWith({
		workspaceId: 'w',
		discard: false,
		stopAgents: false
	});
});

it.each([
	{ confirm: false, discard: true, stopAgents: false },
	{ confirm: true, discard: true, stopAgents: false },
	{ confirm: true, discard: false, stopAgents: false },
	{ confirm: true, discard: false, stopAgents: true }
])('handles confirmation with %o', async ({ confirm, discard, stopAgents }) => {
	vi.mocked(previewArchive).mockResolvedValueOnce({
		concerns: ['Unfinished work'],
		discard,
		stopAgents
	});
	const result = archive('w', 'Workspace');
	await vi.waitFor(() => expect(archiving.asking?.concerns).toEqual(['Unfinished work']));
	archiving.asking!.answer(confirm);
	expect(await result).toBe(confirm);
	if (confirm)
		expect(archiveWorkspace).toHaveBeenCalledExactlyOnceWith({
			workspaceId: 'w',
			discard,
			stopAgents
		});
	else expect(archiveWorkspace).not.toHaveBeenCalled();
});

it('starts a second clean archive while the first is pending', async () => {
	const firstArchive = Promise.withResolvers<void>();
	vi.mocked(previewArchive).mockResolvedValue({ concerns: [], discard: false, stopAgents: false });
	vi.mocked<(input: Parameters<typeof archiveWorkspace>[0]) => Promise<void>>(
		archiveWorkspace
	).mockReturnValueOnce(firstArchive.promise);
	const first = archive('first', 'First');
	await vi.waitFor(() => expect(archiveWorkspace).toHaveBeenCalledTimes(1));
	expect(await archive('second', 'Second')).toBe(true);
	expect(await archive('first', 'First')).toBe(false);
	firstArchive.resolve();
	expect(await first).toBe(true);
});

it('keeps each confirmation until its own archive is answered', async () => {
	const flagged = { concerns: ['Unfinished work'], discard: true, stopAgents: false };
	vi.mocked(previewArchive)
		.mockResolvedValueOnce(flagged)
		.mockResolvedValueOnce(flagged)
		.mockResolvedValueOnce({ concerns: [], discard: false, stopAgents: false });
	const first = archive('first', 'First');
	const second = archive('second', 'Second');
	expect(await archive('clean', 'Clean')).toBe(true);
	expect(archiving.asking?.title).toBe('First');
	archiving.asking!.answer(false);
	expect(await first).toBe(false);
	expect(archiving.asking?.title).toBe('Second');
	archiving.asking!.answer(true);
	expect(await second).toBe(true);
	expect(archiveWorkspace).toHaveBeenLastCalledWith({
		workspaceId: 'second',
		discard: true,
		stopAgents: false
	});
	expect(archiving.asking).toBeNull();
});
