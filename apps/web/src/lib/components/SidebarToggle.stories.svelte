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
		const sheet = canvas.getByRole('complementary');
		const edge = document.elementFromPoint(x, sheet.getBoundingClientRect().top - 1);
		await expect(toggle.parentElement?.contains(edge)).toBe(false);
		await userEvent.click(toggle);
		await expect(canvas.getByRole('button', { name: /Show sidebar/ })).toBe(toggle);
		await expect(toggle).toHaveFocus();
		await expect(toggle.getBoundingClientRect()).toMatchObject({ x, y });
		await userEvent.keyboard('{Enter}');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	}}
>
	<aside class="fixed top-14 left-2 h-32 w-64 sheet-quiet"></aside>
	<SidebarToggle {open} onclick={() => (open = !open)} />
</Story>
