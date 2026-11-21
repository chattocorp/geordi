<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import SoundPlayer from './SoundPlayer.svelte';
	import { tone } from './tone.ts';

	const { Story } = defineMeta({ title: 'UI/Sound player', component: SoundPlayer });
	const wav = (frequency: number, seconds: number) =>
		`data:audio/wav;base64,${tone(frequency, seconds)}`;
</script>

<Story
	name="Sound"
	args={{ src: wav(440, 2), label: 'assets/jump.wav' }}
	play={async ({ canvas, userEvent }) => {
		const slider = canvas.getByRole('slider', { name: 'assets/jump.wav' });
		await waitFor(() => expect(slider).toHaveAttribute('aria-valuemax', '2'));
		slider.focus();
		await userEvent.keyboard('{End}');
		await waitFor(() => expect(slider).toHaveAttribute('aria-valuenow', '2'));
		await expect(canvas.getByRole('button', { name: 'Play assets/jump.wav' })).toBeVisible();
	}}
/>

<Story
	name="Far below"
	asChild
	play={async ({ canvas, canvasElement }) => {
		const slider = canvas.getByRole('slider', { name: 'far.wav' });
		const audio = canvasElement.querySelector('audio')!;
		// nothing is fetched while it is far from the screen
		await new Promise((resolve) => setTimeout(resolve, 200));
		await expect(audio.getAttribute('src')).toBeNull();
		slider.scrollIntoView();
		await waitFor(() => expect(slider).toHaveAttribute('aria-valuemax', '1'));
	}}
>
	<div class="h-screen"></div>
	<div class="h-screen"></div>
	<SoundPlayer src={wav(440, 1)} label="far.wav" />
</Story>

<Story name="Before and after" asChild>
	<div class="flex max-w-prose flex-col gap-2 card p-3">
		<SoundPlayer src={wav(330, 1.5)} label="jump.wav, before" caption="Before" />
		<SoundPlayer src={wav(660, 0.8)} label="jump.wav, after" caption="After" />
	</div>
</Story>

<Story
	name="Not a sound"
	args={{ src: 'data:audio/wav;base64,AAAA', label: 'broken.wav' }}
	play={async ({ canvas }) => {
		await expect(await canvas.findByText('This sound could not be played.')).toBeVisible();
	}}
/>
