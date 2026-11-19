<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Workspace row', component: WorkspaceRow });
</script>

<Story
	name="Demo rows without navigation"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('img', { name: 'Working' })).toBeVisible();
		await expect(canvas.getByRole('img', { name: 'Waiting for your answer' })).toBeVisible();
		await expect(canvas.getByRole('img', { name: 'Checks: 1 running, 2 passed' })).toBeVisible();
		await expect(canvas.queryByRole('link')).toBeNull();
		await expect(canvas.queryByRole('button')).toBeNull();
	}}
>
	<div class="w-64 space-y-px sheet-quiet p-2">
		<WorkspaceRow title="Edit the login form" working />
		<WorkspaceRow title="Choose a page" asking unread />
		<WorkspaceRow
			title="Return people after sign-in"
			current
			standing={{
				label: 'Checks running',
				tone: 'neutral',
				icon: 'icon-[lucide--circle-dashed]',
				checks: { pending: 1, passed: 2, skipped: 0, failed: 0 }
			}}
		/>
	</div>
</Story>

<Story name="A project" asChild>
	<div class="w-64 space-y-px sheet-quiet p-2">
		<WorkspaceRow title="Plan the 0.7 release" icon="icon-[lucide--folder-kanban]" />
		<WorkspaceRow title="Bump the protocol" child />
	</div>
</Story>

<Story
	name="Action checkmark"
	args={{
		title: 'Update the sidebar',
		current: true,
		actions: [{ id: 'merge-pull', label: 'Merge PR', icon: 'icon-[lucide--git-merge]' }],
		onaction: fn()
	}}
	play={async ({ canvasElement, args }) => {
		const pill = within(canvasElement).getByRole('button', { name: /Merge PR/ });
		pill.focus();
		await userEvent.keyboard('{Enter}');
		await expect(args.onaction).toHaveBeenCalledOnce();
		await expect(pill.querySelector('span')).toHaveClass('icon-[lucide--check]');
		await waitFor(
			() => expect(pill.querySelector('span')).toHaveClass('icon-[lucide--git-merge]'),
			{ timeout: 2500 }
		);
	}}
/>
