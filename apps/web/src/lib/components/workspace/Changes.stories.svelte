<script module lang="ts">
	import { expect, fn } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Changes from './Changes.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Changes', component: Changes });
	const pending = {
		changes: null,
		unavailable: null,
		missing: false,
		upstream: null,
		config: null,
		release: null
	};
</script>

<Story
	name="Waiting for local Git"
	args={{ git: pending, onopen: fn() }}
	play={async ({ canvas }) => {
		await expect(canvas.getByText('Loading…')).toBeVisible();
	}}
/>

<Story
	name="Open a file while upstream is pending"
	args={{
		git: {
			...pending,
			changes: {
				branch: 'feature',
				uncommitted: 1,
				unpushed: null,
				landed: false,
				files: [{ path: 'message.txt', status: 'modified', added: 1, removed: 1 }]
			}
		},
		onopen: fn()
	}}
	play={async ({ canvas, userEvent, args }) => {
		await userEvent.click(canvas.getByRole('button', { name: /message.txt/ }));
		await expect(args.onopen).toHaveBeenCalledWith('message.txt');
	}}
/>
