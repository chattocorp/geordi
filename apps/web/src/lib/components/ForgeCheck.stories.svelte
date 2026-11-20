<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import ForgeCheck from './ForgeCheck.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Repository forge access', component: ForgeCheck });
</script>

<Story
	name="Unknown forge"
	args={{
		check: async () => ({
			title: 'Forge not set up',
			context: 'git.example.com',
			message: 'No configured forge matches this origin.',
			setup: true
		})
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await canvas.findByText('git.example.com');
		await userEvent.click(canvas.getByRole('button', { name: 'Check forge access again' }));
		await expect(canvas.getByRole('status')).toHaveTextContent('git.example.com');
		await expect(canvas.getByRole('link', { name: 'Forge setup guide' })).toBeVisible();
	}}
/>
