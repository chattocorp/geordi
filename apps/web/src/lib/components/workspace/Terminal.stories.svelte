<script module lang="ts">
	import { expect, waitFor } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Terminal from './Terminal.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Terminal', component: Terminal });
</script>

<Story
	name="New terminal receives focus"
	asChild
	play={async ({ canvasElement }) => {
		await waitFor(() => {
			const input = canvasElement.querySelector('.xterm-helper-textarea');
			expect(input).not.toBeNull();
			expect(input).toHaveFocus();
		});
	}}
>
	<div class="flex h-64 flex-col bg-bg">
		<Terminal workspaceId="story" terminal="new" start={false} autofocus />
	</div>
</Story>

<Story
	name="Existing terminal leaves focus alone"
	asChild
	play={async ({ canvasElement }) => {
		await waitFor(() => {
			const input = canvasElement.querySelector('.xterm-helper-textarea');
			expect(input).not.toBeNull();
			expect(input).not.toHaveFocus();
		});
	}}
>
	<div class="flex h-64 flex-col bg-bg">
		<Terminal workspaceId="story" terminal="existing" start={false} />
	</div>
</Story>
