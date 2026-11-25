<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import OpenInSettings from './OpenInSettings.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/Settings/Open in',
		component: OpenInSettings,
		args: {
			settings: {
				revision: 0,
				apps: [
					{ id: '1', name: 'Zed', command: 'open -a Zed .', enabled: true },
					{ id: '2', name: 'Finder', command: 'open .', enabled: true }
				]
			},
			onsave: async () => {}
		}
	});
</script>

<Story name="Configured apps" />
<Story
	name="Reorder apps"
	play={async ({ canvasElement, userEvent }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Move Finder up' }));
		await expect(canvas.getAllByRole('textbox', { name: 'Name' })[0]).toHaveValue('Finder');
		await userEvent.click(canvas.getByRole('button', { name: 'Discard' }));
		await expect(canvas.getAllByRole('textbox', { name: 'Name' })[0]).toHaveValue('Zed');
	}}
/>
