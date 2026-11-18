<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor } from 'storybook/test';
	import ArchiveConfirm from './ArchiveConfirm.svelte';

	const { Story } = defineMeta({
		title: 'Workspace/Archive confirmation',
		component: ArchiveConfirm
	});
	const answer = fn();
</script>

<Story
	name="Running process"
	args={{
		asking: {
			title: 'Review login changes',
			concerns: ['Archiving will stop running terminal processes.'],
			blocked: false,
			busy: false,
			answer
		}
	}}
	play={async ({ canvas }) => {
		await waitFor(() =>
			expect(canvas.getByRole('dialog', { name: 'Archive “Review login changes”?' })).toBeVisible()
		);
		await expect(answer).not.toHaveBeenCalled();
		await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
		await expect(answer).toHaveBeenCalledWith(false);
		await userEvent.click(canvas.getByRole('button', { name: 'Archive' }));
		await expect(answer).toHaveBeenCalledWith(true);
	}}
/>
