<script module lang="ts">
	import { expect } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from '@geordi/ui/Button.svelte';
	import EmptyState from '@geordi/ui/EmptyState.svelte';

	const { Story } = defineMeta({ title: 'UI/EmptyState', component: EmptyState });
</script>

<Story
	name="In a pane"
	asChild
	play={async ({ canvas }) => {
		await expect(canvas.getByText('No changes yet')).toBeVisible();
	}}
>
	<div class="flex h-80 w-80 flex-col sheet-quiet">
		<EmptyState icon="icon-[lucide--file-diff]" title="No changes yet" class="min-h-full" />
	</div>
</Story>

<Story
	name="With what to do about it"
	asChild
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('button', { name: 'Add repository…' })).toBeVisible();
	}}
>
	<div class="w-96 sheet p-4">
		<EmptyState icon="icon-[lucide--folder-git-2]" title="Agents work in a repository">
			<p>Add one first.</p>
			<Button variant="primary">Add repository…</Button>
		</EmptyState>
	</div>
</Story>
