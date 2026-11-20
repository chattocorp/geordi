<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn } from 'storybook/test';
	import Toolbar from '@geordi/ui/Toolbar.svelte';
	const { Story } = defineMeta({ title: 'UI/Toolbar', component: Toolbar });
	const copy = fn();
</script>

<Story
	name="Views and commands"
	args={{
		label: 'Document tools',
		items: [
			{ label: 'Read', icon: 'icon-[lucide--eye]', pressed: true, onclick: fn() },
			{ label: 'Copy', icon: 'icon-[lucide--copy]', onclick: copy }
		]
	}}
	play={async ({ canvas, userEvent }) => {
		const read = canvas.getByRole('button', { name: 'Read', pressed: true });
		await userEvent.tab();
		await expect(read).toHaveFocus();
		await userEvent.keyboard('{ArrowRight}');
		await expect(canvas.getByRole('button', { name: 'Copy' })).toHaveFocus();
		await userEvent.keyboard('{Enter}');
		await expect(copy).toHaveBeenCalled();
		await userEvent.keyboard('{ArrowRight}');
		await expect(read).toHaveFocus();
	}}
/>
