<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import Button from '#lib/ui/Button.svelte';
	import MessageComposer from './MessageComposer.svelte';

	const { Story } = defineMeta({ title: 'Workspace/MessageComposer', component: MessageComposer });
	const form = { onsubmit: (event: SubmitEvent) => event.preventDefault() };

	async function exercise({ canvasElement }: { canvasElement: HTMLElement }) {
		const canvas = within(canvasElement);
		const original = window.fetch;
		let uploads = 0;
		let fail = false;
		window.fetch = async (input, init) => {
			if (input !== '/images') return original(input, init);
			uploads++;
			return fail ? new Response('', { status: 500 }) : Response.json({ id: `image-${uploads}` });
		};
		try {
			const textarea = canvas.getByRole('textbox');
			const file = new File(['png'], 'screen.png', { type: 'image/png' });
			const clipboard = new DataTransfer();
			clipboard.items.add(file);
			textarea.dispatchEvent(
				new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true })
			);
			await canvas.findByRole('img', { name: 'Attached image 1' });
			const element = canvasElement.querySelector('form')!;
			expect(new FormData(element).get('images')).toBe('["image-1"]');
			await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
			// A failed submission leaves the images in place.
			expect(new FormData(element).get('images')).toBe('["image-1"]');
			await userEvent.click(canvas.getByRole('button', { name: 'Remove image 1' }));
			expect(new FormData(element).get('images')).toBe('[]');

			const picker = canvas.getByLabelText('Choose images');
			await userEvent.upload(picker, file);
			await canvas.findByRole('img', { name: 'Attached image 1' });
			element.reset(); // successful remote forms reset the native form
			await waitFor(() => expect(new FormData(element).get('images')).toBe('[]'));

			fail = true;
			await userEvent.upload(picker, file);
			await canvas.findByRole('alert');
			expect(new FormData(element).get('images')).toBe('[]');
			fail = false;
			await userEvent.upload(
				picker,
				Array.from({ length: 5 }, () => file)
			);
			expect(canvas.getByRole('alert')).toHaveTextContent('Add up to 4 images');
			expect(uploads).toBe(3);
			element.reset();
		} finally {
			window.fetch = original;
		}
	}
</script>

<Story name="Paste, choose, remove and retry" play={exercise} asChild>
	<div class="max-w-2xl">
		<MessageComposer imageField={{ name: 'images' }} {form} placeholder="Reply to the agent">
			{#snippet footer()}
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</MessageComposer>
	</div>
</Story>
