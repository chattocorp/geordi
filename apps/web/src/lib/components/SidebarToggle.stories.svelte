<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import SidebarToggle from './SidebarToggle.svelte';

	let open = $state(true);
	const { Story } = defineMeta({ title: 'Shell/Sidebar toggle', component: SidebarToggle });
</script>

<Story
	name="Toggle in place"
	asChild
	play={async ({ canvasElement, userEvent }) => {
		const canvas = within(canvasElement);
		const toggle = canvas.getByRole('button', { name: /Hide sidebar/ });
		const { x, y } = toggle.getBoundingClientRect();
		await userEvent.click(toggle);
		await expect(canvas.getByRole('button', { name: /Show sidebar/ })).toBe(toggle);
		await expect(toggle).toHaveFocus();
		await expect(toggle.getBoundingClientRect()).toMatchObject({ x, y });
		await userEvent.keyboard('{Enter}');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	}}
>
	<SidebarToggle {open} onclick={() => (open = !open)} />
</Story>
