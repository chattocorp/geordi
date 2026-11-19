<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor } from 'storybook/test';
	import ImageAttachments from './ImageAttachments.svelte';
	import Composer from '@geordi/ui/Composer.svelte';
	import Button from '@geordi/ui/Button.svelte';

	const { Story } = defineMeta({ title: 'UI/Image attachments', component: ImageAttachments });
	const picture = (width: number, height: number) =>
		`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#242630"/><rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="8" fill="#353844"/><path d="M24 ${height / 2}H${width - 24}" stroke="#d9b963" stroke-width="4"/><circle cx="${width / 2}" cy="${height / 2}" r="16" fill="#d9b963"/></svg>`)}`;
	const samples = [
		{ id: 'wide', src: picture(480, 240), alt: 'Wide screenshot' },
		{ id: 'tall', src: picture(120, 240), alt: 'Portrait screenshot' },
		{ id: 'panorama', src: picture(1200, 100), alt: 'Panoramic screenshot' }
	];
	const removed = fn();
</script>

<script lang="ts">
	let images = $state(samples);
</script>

<Story name="In the composer" asChild>
	<div class="max-w-2xl">
		<Composer
			form={{ onsubmit: (event) => event.preventDefault() }}
			placeholder="Describe these images"
			value="Please compare these screenshots."
		>
			{#snippet attachments()}
				<ImageAttachments
					{images}
					onremove={(id) => (images = images.filter((image) => image.id !== id))}
				/>
			{/snippet}
			{#snippet footer()}
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story
	name="Narrow composer"
	asChild
	play={async ({ canvas, canvasElement }) => {
		const wide = canvas.getByAltText('Wide screenshot') as HTMLImageElement;
		const tall = canvas.getByAltText('Portrait screenshot') as HTMLImageElement;
		await waitFor(() => expect(wide.naturalWidth).toBe(480));
		await waitFor(() => expect(tall.naturalWidth).toBe(120));
		expect(wide.clientWidth / wide.clientHeight).toBe(2);
		expect(tall.clientWidth / tall.clientHeight).toBe(0.5);
		const panorama = canvas.getByAltText('Panoramic screenshot');
		expect(getComputedStyle(panorama).objectFit).toBe('contain');
		const row = canvas.getByRole('list', { name: 'Attached images' });
		expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
		expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			canvas.getByRole('textbox').getBoundingClientRect().top
		);
		const preview = canvas.getByRole('link', { name: 'Open image 1' });
		expect(preview).toHaveAttribute('href', samples[0].src);
		expect(preview).toHaveAttribute('target', '_blank');
		preview.focus();
		const remove = canvas.getByRole('button', { name: 'Remove image 1' });
		await waitFor(() => expect(getComputedStyle(remove).opacity).toBe('1'));
		await userEvent.tab();
		expect(canvasElement.ownerDocument.activeElement).toBe(remove);
		await userEvent.keyboard('{Enter}');
		expect(removed).toHaveBeenCalledWith('wide');
	}}
>
	<div class="w-80">
		<Composer
			form={{ onsubmit: (event) => event.preventDefault() }}
			placeholder="Describe these images"
		>
			{#snippet attachments()}<ImageAttachments images={samples} onremove={removed} />{/snippet}
			{#snippet footer()}<Button
					label="Send"
					icon="icon-[lucide--arrow-up]"
					variant="primary"
					class="ml-auto"
				/>{/snippet}
		</Composer>
	</div>
</Story>
