<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import FileView from './FileView.svelte';
	import logo from '#lib/assets/favicon.svg?raw';

	/** Half a second of a 440 Hz tone, as a WAV file in base64. */
	function tone() {
		const rate = 8000;
		const samples = rate / 2;
		const view = new DataView(new ArrayBuffer(44 + samples));
		const text = (at: number, value: string) =>
			[...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
		text(0, 'RIFF');
		view.setUint32(4, 36 + samples, true);
		text(8, 'WAVEfmt ');
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, 1, true);
		view.setUint32(24, rate, true);
		view.setUint32(28, rate, true);
		view.setUint16(32, 1, true);
		view.setUint16(34, 8, true);
		text(36, 'data');
		view.setUint32(40, samples, true);
		for (let index = 0; index < samples; index++)
			view.setUint8(44 + index, 128 + 64 * Math.sin((2 * Math.PI * 440 * index) / rate));
		return btoa(String.fromCharCode(...new Uint8Array(view.buffer)));
	}

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
	args={{ path: 'assets/beep.wav', current: { mediaType: 'audio/wav', data: tone() } }}
	play={async ({ canvasElement }) => {
		const audio = canvasElement.querySelector('audio');
		await expect(audio).toHaveAttribute('controls');
		await waitFor(() => expect(audio?.duration).toBeCloseTo(0.5));
	}}
/>

<Story
	name="Changed sound"
	args={{
		path: 'assets/beep.wav',
		old: { mediaType: 'audio/wav', data: tone() },
		current: { mediaType: 'audio/wav', data: tone() }
	}}
	play={async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Before' }));
		await expect(canvasElement.querySelector('audio')).toBeTruthy();
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
