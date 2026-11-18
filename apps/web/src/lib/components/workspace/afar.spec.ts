import { expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import { archiveAndNavigate } from './afar.svelte.ts';
import { archive } from './archive.svelte.ts';

const url = vi.hoisted(() => new URL('https://geordi.test'));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({
	page: { url },
	navigating: { to: null }
}));
vi.mock('./archive.svelte.ts', () => ({ archive: vi.fn(), archiveProblems: {} }));
vi.mock('../../../routes/workspaces.remote', () => ({}));

it.each([
	{ current: '/workspaces/other', parentId: null, destination: null },
	{ current: '/workspaces/first', parentId: null, destination: '/' },
	{ current: '/workspaces/first', parentId: 'parent', destination: '/workspaces/parent' }
])(
	'finishes an archive with $current open and parent $parentId',
	async ({ current, parentId, destination }) => {
		vi.mocked(goto).mockClear();
		const pending = Promise.withResolvers<boolean>();
		vi.mocked(archive).mockReturnValueOnce(pending.promise);
		url.pathname = '/workspaces/first';
		const result = archiveAndNavigate({ id: 'first', title: 'First', parentId });
		url.pathname = current;
		pending.resolve(true);
		await result;
		if (destination) expect(goto).toHaveBeenCalledExactlyOnceWith(destination);
		else expect(goto).not.toHaveBeenCalled();
	}
);
