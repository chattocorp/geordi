import { expect, it, vi } from 'vitest';
import { archive, archiving } from './archive.svelte.ts';
import { archiveWorkspace, previewArchive } from '../../../routes/workspaces.remote';

vi.mock('../../../routes/workspaces.remote', () => ({
	archiveWorkspace: vi.fn(),
	previewArchive: vi.fn(async () => [])
}));

it('requires a separate confirmation even when the archive preview finds no concerns', async () => {
	const cancel = archive('w', 'Workspace');
	await vi.waitFor(() => expect(archiving.asking?.concerns).toEqual([]));
	expect(archiveWorkspace).not.toHaveBeenCalled();
	archiving.asking!.answer(false);
	expect(await cancel).toBe(false);
	expect(archiveWorkspace).not.toHaveBeenCalled();

	const confirm = archive('w', 'Workspace');
	await vi.waitFor(() => expect(archiving.asking?.concerns).toEqual([]));
	archiving.asking!.answer(true);
	expect(await confirm).toBe(true);
	expect(previewArchive).toHaveBeenCalledTimes(2);
	expect(archiveWorkspace).toHaveBeenCalledExactlyOnceWith({
		workspaceId: 'w',
		confirmed: true,
		discard: false
	});
});
