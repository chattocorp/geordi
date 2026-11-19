<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
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
