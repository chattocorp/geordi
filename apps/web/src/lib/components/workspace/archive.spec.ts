import { beforeEach, expect, it, vi } from 'vitest';
import { archive, archiving } from './archive.svelte.ts';
import { archiveWorkspace, previewArchive } from '../../../routes/workspaces.remote';

vi.mock('../../../routes/workspaces.remote', () => ({
	archiveWorkspace: vi.fn(),
	previewArchive: vi.fn()
}));

beforeEach(() => vi.clearAllMocks());

it('checks once without opening a dialog and archives a clean workspace', async () => {
	vi.mocked(previewArchive).mockResolvedValueOnce({ concerns: [], discard: false, blocked: false });
	const result = archive('w', 'Workspace');
	expect(archiving.asking).toBeNull();
	expect(await archive('w', 'Workspace')).toBe(false);
	expect(await result).toBe(true);
	expect(archiveWorkspace).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'w', discard: false });
});

it.each([
	{ confirm: false, discard: true, blocked: false },
	{ confirm: true, discard: true, blocked: false },
	{ confirm: true, discard: false, blocked: false },
	{ confirm: true, discard: false, blocked: true }
])('handles confirmation with %o', async ({ confirm, discard, blocked }) => {
	vi.mocked(previewArchive).mockResolvedValueOnce({
		concerns: [{ label: 'Unfinished work' }],
		discard,
		blocked
	});
	const result = archive('w', 'Workspace');
	await vi.waitFor(() =>
		expect(archiving.asking?.concerns).toEqual([{ label: 'Unfinished work' }])
	);
	archiving.asking!.answer(confirm);
	expect(await result).toBe(confirm && !blocked);
	if (confirm && !blocked)
		expect(archiveWorkspace).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'w', discard });
	else expect(archiveWorkspace).not.toHaveBeenCalled();
});

it('starts a second clean archive while the first is pending', async () => {
	const firstArchive = Promise.withResolvers<void>();
	vi.mocked(previewArchive).mockResolvedValue({ concerns: [], discard: false, blocked: false });
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
	const flagged = { concerns: [{ label: 'Unfinished work' }], discard: true, blocked: false };
	vi.mocked(previewArchive)
		.mockResolvedValueOnce(flagged)
		.mockResolvedValueOnce(flagged)
		.mockResolvedValueOnce({ concerns: [], discard: false, blocked: false });
	const first = archive('first', 'First');
	const second = archive('second', 'Second');
	expect(await archive('clean', 'Clean')).toBe(true);
	expect(archiving.asking?.title).toBe('First');
	archiving.asking!.answer(false);
	expect(await first).toBe(false);
	expect(archiving.asking?.title).toBe('Second');
	archiving.asking!.answer(true);
	expect(await second).toBe(true);
	expect(archiveWorkspace).toHaveBeenLastCalledWith({ workspaceId: 'second', discard: true });
	expect(archiving.asking).toBeNull();
});
