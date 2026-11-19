<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor } from 'storybook/test';
	import Button from '@geordi/ui/Button.svelte';
	import Dialog from './Dialog.svelte';

	const { Story } = defineMeta({ title: 'UI/Dialog', component: Dialog });

	let open = $state(false);
</script>

<Story
	name="Open"
	asChild
	play={async ({ canvas }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Open the dialog' }));
		const dialog = canvas.getByRole('dialog', { name: 'An example' });
		await waitFor(() => expect(dialog).toBeVisible());
	}}
>
	<Button onclick={() => (open = true)}>Open the dialog</Button>
	<Dialog bind:open label="An example">
		<div class="space-y-4 p-6">
			<p class="heading">An example</p>
			<p class="text-muted">Escape, or a click beside it, closes it.</p>
			<Button variant="primary" onclick={() => (open = false)}>Done</Button>
		</div>
	</Dialog>
</Story>
