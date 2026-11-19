<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import { promptTitle } from '#lib/prompt-title.ts';
	import WorkspaceHeading from './WorkspaceHeading.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Workspace heading', component: WorkspaceHeading });
	const prompt =
		'Show the suggested prompt above the composer so that I can run it with one click or edit it before sending.';
</script>

<Story
	name="Prompt fits the conversation column"
	args={{ title: promptTitle(prompt), prompt, columnWidth: 380 }}
	play={async ({ canvasElement }) => {
		const heading = within(canvasElement).getByRole('heading', { name: prompt });
		await expect(heading.clientWidth).toBe(380);
		await expect(heading.scrollWidth).toBeGreaterThan(heading.clientWidth);
	}}
/>
<Story name="Agent title" args={{ title: 'Edit suggested prompts', prompt }} />
