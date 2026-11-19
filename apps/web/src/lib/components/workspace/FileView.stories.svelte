<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import FileView from './FileView.svelte';
	import logo from '#lib/assets/favicon.svg?raw';

	const { Story } = defineMeta({ title: 'Geordi/File preview', component: FileView });
</script>

<Story
	name="SVG"
	args={{ path: 'logo.svg', current: logo }}
	play={async ({ canvas, userEvent }) => {
		await expect(canvas.getByRole('img').getBoundingClientRect().width).toBeGreaterThan(0);
		await userEvent.click(canvas.getByRole('button', { name: 'Enlarge image' }));
		await expect(canvas.getByRole('dialog')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await userEvent.click(canvas.getByRole('button', { name: 'Source' }));
		await expect(canvas.getByText(logo.trim())).toBeVisible();
	}}
/>

<Story
	name="Markdown change"
	args={{ path: 'notes.md', old: null, current: '# Release notes\n\nImages in the workspace.' }}
	play={async ({ canvas, userEvent }) => {
		await expect(canvas.getByRole('heading', { name: 'Release notes' })).toBeVisible();
		await expect(canvas.getByRole('toolbar', { name: 'File view' })).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Diff' }));
		await expect(canvas.getByRole('button', { name: 'Diff', pressed: true })).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Preview' }));
		await expect(canvas.getByRole('heading', { name: 'Release notes' })).toBeVisible();
	}}
/>
