<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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
			archivedAt: '2026-11-16T12:00:00Z'
		}
	];
</script>

<Story name="Archived workspaces" args={{ entries }} />
<Story
	name="Search by repository"
	args={{ entries }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByRole('searchbox'), 'web');
		await expect(canvas.getByRole('link')).toHaveAttribute('href', '/workspaces/release');
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
