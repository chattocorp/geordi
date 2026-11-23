import { expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import { archiveAndNavigate, setInactive } from './afar.svelte.ts';
import { archive } from './archive.svelte.ts';

const url = vi.hoisted(() => new URL('https://geordi.test'));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({
	page: { url },
	navigating: { to: null }
}));
vi.mock('./archive.svelte.ts', () => ({ archive: vi.fn(), archiveProblems: {} }));
vi.mock('../../../routes/workspaces.remote', () => ({ setWorkspaceInactive: vi.fn() }));

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

it.each([
	{ current: '/workspaces/first', inactive: true, hiding: true, parentId: null, destination: '/' },
	{
		current: '/workspaces/first',
		inactive: true,
		hiding: true,
		parentId: 'parent',
		destination: '/workspaces/parent'
	},
	{
		current: '/workspaces/first',
		inactive: true,
		hiding: false,
		parentId: null,
		destination: null
	},
	{
		current: '/workspaces/first',
		inactive: false,
		hiding: true,
		parentId: null,
		destination: null
	},
	{ current: '/workspaces/other', inactive: true, hiding: true, parentId: null, destination: null }
])(
	'marks inactive=$inactive from $current, hiding=$hiding, parent $parentId',
	async ({ current, inactive, hiding, parentId, destination }) => {
		vi.mocked(goto).mockClear();
		url.pathname = current;
		await setInactive({ id: 'first', title: 'First', parentId }, inactive, hiding);
		if (destination) expect(goto).toHaveBeenCalledExactlyOnceWith(destination);
		else expect(goto).not.toHaveBeenCalled();
	}
);
