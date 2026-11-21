<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
	import ContextMenu from '#lib/ui/ContextMenu.svelte';
	import Archive from './Archive.svelte';
	const { Story } = defineMeta({ title: 'Geordi/Archive', component: Archive });
	const entries = [
		{
			id: 'sidebar',
			title: 'Simplify the workspace sidebar',
			repoId: 'geordi',
			repository: 'Geordi',
			archivedAt: '2026-11-18T12:00:00Z'
		},
		{
			id: 'release',
			title: 'Publish the release guide',
			repoId: 'website',
			repository: 'Website',
			archivedAt: new Date(2026, 10, 16, 12).toISOString()
		}
	];
</script>

<Story name="Archived workspaces" args={{ entries }} />
<Story
	name="Archive by day"
	args={{
		entries: [
			...entries,
			{
				id: 'project',
				repoId: null,
				title: 'Plan the next release',
				repository: 'Project',
				archivedAt: new Date(2026, 10, 16, 9).toISOString()
			}
		],
		onpurge: fn(async () => ({ purged: 3, freed: 0 }))
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getAllByRole('heading', { level: 2 })).toHaveLength(2);
		const lists = canvas.getAllByRole('list');
		await expect(
			within(lists[0]).getAllByRole('button', { name: /Plan|Simplify|Publish/ })
		).toHaveLength(1);
		await expect(
			within(lists[1]).getAllByRole('button', { name: /Plan|Simplify|Publish/ })
		).toHaveLength(2);
		await userEvent.type(canvas.getByRole('searchbox'), 'Project');
		await expect(canvas.getAllByRole('heading', { level: 2 })).toHaveLength(1);
		await expect(canvas.getByRole('button', { name: /Plan the next release/ })).toBeVisible();
		await userEvent.clear(canvas.getByRole('searchbox'));
	}}
/>
<Story
	name="Search by repository"
	args={{ entries }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByRole('searchbox'), 'web');
		await expect(canvas.getByRole('button', { name: /Publish the release guide/ })).toBeVisible();
		await expect(canvas.queryByRole('button', { name: /Simplify/ })).toBeNull();
	}}
/>
<Story name="Empty archive" args={{ entries: [] }} />
<Story
	name="Delete all, for good"
	args={{ entries, onpurge: fn(async () => ({ purged: 2, freed: 52_400_000 })) }}
	play={async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Delete all' }));
		const dialog = within(document.body).getByRole('dialog');
		await expect(dialog).toHaveAccessibleName('Delete 2 archived workspaces permanently?');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
		await expect(args.onpurge).toHaveBeenCalledWith(['sidebar', 'release']);
		await waitFor(() =>
			expect(
				canvas.getByText("Deleted 2 workspaces. Geordi's log is 52.4 MB smaller.")
			).toBeVisible()
		);
	}}
/>
<Story
	name="Delete what was searched for"
	args={{ entries, onpurge: fn(async () => ({ purged: 1, freed: 0 })) }}
	play={async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByRole('searchbox'), 'web');
		await userEvent.click(canvas.getByRole('button', { name: 'Delete 1' }));
		const dialog = within(document.body).getByRole('dialog');
		await expect(dialog).toHaveAccessibleName('Delete “Publish the release guide” permanently?');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
		await expect(args.onpurge).toHaveBeenCalledWith(['release']);
		await waitFor(() => expect(canvas.getByText('Deleted one workspace.')).toBeVisible());
	}}
/>
<Story
	name="Refused"
	args={{
		entries,
		onpurge: fn(async () => {
			throw new Error('“Help” is not archived');
		})
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Delete all' }));
		const dialog = within(document.body).getByRole('dialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
		await expect(await within(dialog).findByRole('alert')).toHaveTextContent(
			'“Help” is not archived'
		);
	}}
/>

<Story
	name="Restore on click, once confirmed"
	args={{ entries, onrestore: fn(async () => {}) }}
	play={async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: /Publish the release guide/ }));
		const dialog = within(document.body).getByRole('dialog');
		await expect(dialog).toHaveAccessibleName('Restore “Publish the release guide”?');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		await expect(args.onrestore).not.toHaveBeenCalled();
		await userEvent.click(canvas.getByRole('button', { name: /Publish the release guide/ }));
		await userEvent.click(
			within(within(document.body).getByRole('dialog')).getByRole('button', { name: 'Restore' })
		);
		await expect(args.onrestore).toHaveBeenCalledWith('release');
	}}
/>
<Story
	name="Restore from the row menu"
	args={{
		entries,
		onrestore: fn(async () => {}),
		onpurge: fn(async () => ({ purged: 1, freed: 0 }))
	}}
	play={async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);
		await fireEvent.contextMenu(canvas.getByText('Publish the release guide'));
		const [restore, remove] = await canvas.findAllByRole('menuitem');
		await expect(restore).toHaveAccessibleName('Restore workspace…');
		await expect(remove).toHaveAccessibleName('Delete permanently…');
		await userEvent.click(restore);
		const dialog = within(document.body).getByRole('dialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));
		await expect(args.onrestore).toHaveBeenCalledWith('release');
		await expect(args.onpurge).not.toHaveBeenCalled();
	}}
>
	{#snippet template(args)}
		<Archive {...args} />
		<ContextMenu />
	{/snippet}
</Story>
