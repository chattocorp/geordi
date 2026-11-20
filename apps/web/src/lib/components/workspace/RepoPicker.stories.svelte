<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn } from 'storybook/test';
	import RepoPicker from './RepoPicker.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Repository picker', component: RepoPicker });
	const onadd = fn();
	const repos = [
		{ id: 'geordi', name: 'Geordi' },
		{ id: 'sample', name: 'Sample project' }
	];
</script>

<Story name="Repository choices" asChild>
	<RepoPicker {repos} value="geordi" {onadd} open />
</Story>

<Story
	name="Add from the keyboard"
	args={{ repos, value: 'sample', onadd }}
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Repository: Sample project' }));
		await userEvent.type(canvas.getByRole('combobox'), 'add{Enter}');
		await expect(onadd).toHaveBeenCalled();
		await expect(canvas.getByRole('button', { name: 'Repository: Sample project' })).toHaveFocus();
	}}
/>
