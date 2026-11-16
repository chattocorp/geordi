<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';

	const { Story } = defineMeta({ title: 'UI/Dialog', component: Dialog });

	let open = $state(true);
</script>

<Story name="Open" asChild>
	<Button onclick={() => (open = true)}>Open the dialog</Button>
	<Dialog bind:open label="An example">
		<div class="space-y-4 p-6">
			<p class="heading">An example</p>
			<p class="text-muted">Escape, or a click beside it, closes it.</p>
			<Button variant="primary" onclick={() => (open = false)}>Done</Button>
		</div>
	</Dialog>
</Story>
