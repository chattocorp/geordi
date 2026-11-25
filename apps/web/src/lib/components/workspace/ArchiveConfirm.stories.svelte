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
			concerns: ['Uncommitted changes will be discarded.', 'Running processes will be stopped.'],
			stopAgents: false,
			busy: false,
			answer
		}
	}}
	play={async ({ canvas }) => {
		await waitFor(() =>
			expect(canvas.getByRole('dialog', { name: 'Archive “Review login changes”?' })).toBeVisible()
		);
		await expect(canvas.getByText('Uncommitted changes will be discarded.')).toBeVisible();
		await expect(canvas.getByText('Running processes will be stopped.')).toBeVisible();
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

<Story
	name="Busy agents"
	args={{
		asking: {
			title: 'Repository home workspaces',
			concerns: ['Busy agents will be stopped.'],
			stopAgents: true,
			busy: false,
			answer
		}
	}}
	play={async ({ canvas }) => {
		await userEvent.click(await canvas.findByRole('button', { name: 'Stop and archive' }));
		await expect(answer).toHaveBeenCalledWith(true);
	}}
/>

<Story
	name="Missing checkout"
	args={{
		asking: {
			title: 'Review login changes',
			concerns: [
				'The repository checkout is missing at /code/login.',
				'Your workspace files will stay in /worktrees/login/review.'
			],
			missingCheckout: true,
			stopAgents: false,
			busy: false,
			answer
		}
	}}
/>
