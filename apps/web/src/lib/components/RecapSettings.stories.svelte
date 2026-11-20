<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent } from 'storybook/test';
	import RecapSettings from './RecapSettings.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/Settings/Workspace recaps',
		component: RecapSettings
	});
</script>

<Story
	name="Recap preference and usage"
	args={{ totals: { claude: 8100, codex: 2300 } }}
	play={async ({ canvas }) => {
		const off = canvas.getByRole('radio', { name: 'Off' });
		await userEvent.click(off);
		await expect(off).toHaveAttribute('aria-checked', 'true');
		await expect(localStorage.getItem('geordi:automatic-recaps')).toBe('off');
		await userEvent.click(canvas.getByRole('radio', { name: 'On' }));
	}}
/>
