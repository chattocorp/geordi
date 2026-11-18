<script module lang="ts">
	import { expect } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ConnectionIndicator from './ConnectionIndicator.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/ConnectionIndicator',
		component: ConnectionIndicator
	});
</script>

<Story
	name="Connected"
	args={{ lost: false }}
	play={async ({ canvas }) => {
		const status = canvas.getByRole('status');
		await expect(status).toHaveTextContent(/^$/);
		await expect(status).toHaveStyle({ position: 'absolute' });
	}}
/>
<Story
	name="Reconnecting"
	args={{ lost: true }}
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('status')).toHaveTextContent('Reconnecting');
		await expect(canvas.getByText('Reconnecting')).toBeVisible();
	}}
/>
