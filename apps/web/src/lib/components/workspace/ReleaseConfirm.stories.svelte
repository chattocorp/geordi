<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor } from 'storybook/test';
	import ReleaseConfirm from './ReleaseConfirm.svelte';
	const { Story } = defineMeta({
		title: 'Workspace/Release confirmation',
		component: ReleaseConfirm
	});
	const asking = {
		auto: false,
		token: 'preview',
		problem: null,
		answer: fn(),
		increases: [
			{
				path: 'packages/api',
				name: 'api',
				before: '1.4.3',
				from: 'patch',
				after: '1.5.0',
				to: 'minor'
			}
		]
	};
</script>

<Story
	name="Patch to minor"
	args={{ asking }}
	play={async ({ canvas }) => {
		await waitFor(() => expect(canvas.getByRole('dialog')).toBeVisible());
		await userEvent.click(canvas.getByRole('button', { name: 'Merge PR' }));
		await expect(asking.answer).toHaveBeenCalledWith('confirm');
	}}
/>
<Story
	name="Unavailable"
	args={{ asking: { ...asking, problem: 'Sweet Release is unavailable.' } }}
/>
<Story name="Auto-merge" args={{ asking: { ...asking, auto: true } }} />
<Story
	name="Auto-merge unavailable"
	args={{ asking: { ...asking, auto: true, problem: 'Sweet Release is unavailable.' } }}
	play={async ({ canvas }) => {
		await expect(canvas.queryByRole('button', { name: 'Merge without release check' })).toBeNull();
		await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
		await expect(asking.answer).toHaveBeenCalledWith('retry');
	}}
/>
