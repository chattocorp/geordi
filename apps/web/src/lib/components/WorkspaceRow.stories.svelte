<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
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
