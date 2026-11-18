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
		concerns: ['Unfinished work'],
		discard,
		blocked
	});
	const result = archive('w', 'Workspace');
	await vi.waitFor(() => expect(archiving.asking?.concerns).toEqual(['Unfinished work']));
	archiving.asking!.answer(confirm);
	expect(await result).toBe(confirm && !blocked);
	if (confirm && !blocked)
		expect(archiveWorkspace).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'w', discard });
	else expect(archiveWorkspace).not.toHaveBeenCalled();
});
