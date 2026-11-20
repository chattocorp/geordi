<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import FileView from './FileView.svelte';
	import logo from '#lib/assets/favicon.svg?raw';

	const { Story } = defineMeta({ title: 'Geordi/File preview', component: FileView });
</script>

<Story
	name="SVG"
	args={{ path: 'logo.svg', current: logo }}
	play={async ({ canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByRole('img').getBoundingClientRect().width).toBeGreaterThan(0);
		await userEvent.click(canvas.getByRole('button', { name: 'Enlarge image' }));
		await expect(canvas.getByRole('dialog')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await userEvent.click(canvas.getByRole('button', { name: 'Source' }));
		await waitFor(() => expect(canvasElement.querySelector('pre')).toHaveTextContent(logo.trim()));
	}}
/>

<Story
	name="Markdown change"
	args={{ path: 'notes.md', old: null, current: '# Release notes\n\nImages in the workspace.' }}
	play={async ({ canvas, userEvent }) => {
		await expect(canvas.getByRole('button', { name: 'Diff', pressed: true })).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Preview' }));
		await expect(canvas.getByRole('heading', { name: 'Release notes' })).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Diff' }));
		await expect(canvas.queryByRole('heading', { name: 'Release notes' })).toBeNull();
	}}
/>

<Story
	name="TypeScript source"
	args={{
		path: 'src/greeting.ts',
		current:
			'// Build a greeting for the workspace.\nexport function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n',
		line: 3
	}}
	play={async ({ canvasElement, canvas }) => {
		await waitFor(() =>
			expect(canvas.getByLabelText('Line 3').querySelector('span[style]')).toBeTruthy()
		);
		await expect(canvasElement.querySelector('pre')?.textContent).toContain(
			'export function greet(name: string)'
		);
	}}
/>
