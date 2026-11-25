<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import RepositoryRow from './RepositoryRow.svelte';

	const repo = {
		id: 'widgets',
		name: 'widgets',
		path: '/Users/ada/src/widgets',
		workspaceCount: 1
	};
	const { Story } = defineMeta({
		title: 'Geordi/Repository row',
		component: RepositoryRow,
		args: {
			repo,
			onremove: () => {}
		}
	});
</script>

<Story
	name="Readable"
	args={{
		check: async () => ({
			status: 'ok',
			summary: 'github.com · signed in',
			origin: 'https://github.com/ada/widgets.git',
			forge: 'github',
			access: 'credentials'
		})
	}}
/>

<Story
	name="Unknown forge"
	args={{
		repo: { ...repo, workspaceCount: 0 },
		check: async () => ({
			status: 'problem',
			summary: 'No forge set up for git.example.com',
			setup: true,
			origin: 'https://git.example.com/ada/widgets.git'
		})
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole('status')).toHaveTextContent(
			'No forge set up for git.example.com'
		);
		await userEvent.click(canvas.getByText('widgets'));
		await expect(canvas.getByText('https://git.example.com/ada/widgets.git')).toBeVisible();
		await expect(canvas.getByRole('link', { name: 'Setup guide' })).toBeVisible();
		await expect(canvas.getByRole('button', { name: 'Remove' })).toBeEnabled();
	}}
/>

<Story
	name="No forge"
	args={{
		check: async () => ({
			status: 'none',
			summary: 'Origin is not on a forge',
			origin: '/srv/git/widgets.git'
		})
	}}
/>

<Story name="Checking" args={{ check: () => new Promise(() => {}) }} />

<Story
	name="Missing checkout"
	args={{
		check: async () => ({ status: 'problem', summary: 'The repository checkout is missing' })
	}}
	play={async ({ canvas }) => {
		await expect(await canvas.findByRole('status')).toHaveTextContent('checkout is missing');
		await userEvent.click(canvas.getByText('widgets'));
		await userEvent.click(canvas.getByRole('button', { name: 'Remove' }));
		await expect(canvas.getByRole('dialog')).toHaveTextContent('including uncommitted changes');
		await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
	}}
/>
