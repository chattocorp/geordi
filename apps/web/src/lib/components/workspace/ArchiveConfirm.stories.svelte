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
			concerns: [
				{
					label: '2 files have uncommitted changes, which will be discarded.',
					items: ['src/login.ts', 'tests/login.test.ts']
				},
				{ label: 'Archiving will stop this work', items: ['Job “web”', 'Terminal 1 · node'] }
			],
			blocked: false,
			busy: false,
			answer
		}
	}}
	play={async ({ canvas }) => {
		await waitFor(() =>
			expect(canvas.getByRole('dialog', { name: 'Archive “Review login changes”?' })).toBeVisible()
		);
		await expect(canvas.getByText('tests/login.test.ts')).toBeVisible();
		await expect(canvas.getByText('Terminal 1 · node')).toBeVisible();
		await expect(answer).not.toHaveBeenCalled();
		const cancel = canvas.getByRole('button', { name: 'Cancel' });
		const archive = canvas.getByRole('button', { name: 'Archive' });
		const dialog = canvas.getByRole('dialog');
		await Promise.all(dialog.getAnimations().map((animation) => animation.finished));
		const bounds = cancel.getBoundingClientRect();
		await expect(archive.getBoundingClientRect()).toMatchObject({
			y: bounds.y,
			width: bounds.width,
			height: bounds.height
		});
		await expect(getComputedStyle(cancel).fontWeight).toBe(getComputedStyle(archive).fontWeight);
		await expect(getComputedStyle(cancel).boxShadow).not.toContain('inset');
		await userEvent.click(cancel);
		await expect(answer).toHaveBeenCalledWith(false);
		await userEvent.click(archive);
		await expect(answer).toHaveBeenCalledWith(true);
	}}
/>
