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
	name="Clean workspace"
	args={{ asking: { title: 'Review login changes', concerns: [], busy: false, answer } }}
	play={async ({ canvas }) => {
		await waitFor(() =>
			expect(canvas.getByRole('dialog', { name: 'Archive “Review login changes”?' })).toBeVisible()
		);
		await expect(answer).not.toHaveBeenCalled();
		const cancel = canvas.getByRole('button', { name: 'Cancel' });
		const archive = canvas.getByRole('button', { name: 'Archive' });
		await expect(cancel.offsetWidth).toBe(archive.offsetWidth);
		await expect(cancel.offsetHeight).toBe(archive.offsetHeight);
		await userEvent.click(cancel);
		await expect(answer).toHaveBeenCalledWith(false);
		await userEvent.click(archive);
		await expect(answer).toHaveBeenCalledWith(true);
	}}
/>
