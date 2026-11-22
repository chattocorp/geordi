<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import FileView from './FileView.svelte';
	import { tone } from '#lib/ui/tone.ts';
	import logo from '#lib/assets/favicon.svg?raw';

	/** A PNG of one red pixel. */
	const dot =
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

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
	name="Sound"
	args={{ path: 'assets/beep.wav', current: { mediaType: 'audio/wav', data: tone(440, 2) } }}
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('button', { name: 'Play assets/beep.wav' })).toBeVisible();
		await waitFor(() =>
			expect(canvas.getByRole('slider')).toHaveAttribute('aria-valuetext', '0:00.0 of 0:02.0')
		);
	}}
/>

<Story
	name="Changed sound"
	args={{
		path: 'assets/beep.wav',
		old: { mediaType: 'audio/wav', data: tone(330, 1.5) },
		current: { mediaType: 'audio/wav', data: tone(660, 0.8) }
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('button', { name: 'Play Before' })).toBeVisible();
		await expect(canvas.getByRole('button', { name: 'Play After' })).toBeVisible();
		await expect(canvas.getAllByRole('slider')).toHaveLength(2);
	}}
/>

<Story
	name="New sound"
	args={{
		path: 'assets/beep.wav',
		old: null,
		current: { mediaType: 'audio/wav', data: tone(440, 1) }
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getByText('New file')).toBeVisible();
		await expect(canvas.getAllByRole('slider')).toHaveLength(1);
		await expect(canvas.queryByText('Before')).toBeNull();
	}}
/>

<Story
	name="Moved sound"
	args={{
		path: 'assets/beep.wav',
		old: { mediaType: 'audio/wav', data: tone(440, 1) },
		current: { mediaType: 'audio/wav', data: tone(440, 1) }
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getByText('Content unchanged')).toBeVisible();
		await expect(canvas.getAllByRole('slider')).toHaveLength(1);
	}}
/>

<Story
	name="Changed image"
	args={{ path: 'logo.svg', old: logo, current: { mediaType: 'image/png', data: dot } }}
	play={async ({ canvas, userEvent }) => {
		await expect(canvas.getAllByRole('img')).toHaveLength(2);
		await expect(canvas.getByText('Before')).toBeVisible();
		await userEvent.click(canvas.getAllByRole('button', { name: 'Enlarge image' })[1]);
		await expect(canvas.getByRole('dialog')).toBeVisible();
	}}
/>

<Story
	name="Changed SVG"
	args={{
		path: 'logo.svg',
		old: logo,
		current: { mediaType: 'image/svg+xml', data: btoa(logo.replace('#2c2f3b', '#b8862b')) }
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getAllByRole('img')).toHaveLength(2);
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

<Story
	name="Wrapping long lines"
	args={{
		path: 'notes.txt',
		current: `short line\n${'a long line that goes on and on '.repeat(20)}\nanother short line\n`,
		wrap: true
	}}
	play={async ({ canvasElement }) => {
		await expect(getComputedStyle(canvasElement.querySelector('pre')!).whiteSpace).toBe('pre-wrap');
	}}
/>

<Story
	name="Wrapping a diff"
	args={{
		path: 'src/app.ts',
		old: `const a = 1;\nconst b = 2;\n`,
		current: `const a = 1;\nconst b = ${'"a very long string that runs off the edge of the pane", '.repeat(8)};\n`,
		wrap: true
	}}
	play={async ({ canvasElement }) => {
		await waitFor(() =>
			expect(
				canvasElement.querySelector('diffs-container')?.shadowRoot?.querySelector('pre')
			).toHaveAttribute('data-overflow', 'wrap')
		);
	}}
/>
