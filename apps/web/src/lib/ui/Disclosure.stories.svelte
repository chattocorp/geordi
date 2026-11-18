<script module lang="ts">
	import { expect } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Disclosure from './Disclosure.svelte';

	const { Story } = defineMeta({ title: 'UI/Disclosure', component: Disclosure });
</script>

<Story
	name="Nested sections"
	asChild
	play={async ({ canvas, userEvent }) => {
		const row = canvas.getByText('Build output');
		await expect(canvas.getByText('Build complete')).not.toBeVisible();
		await userEvent.click(row);
		await expect(canvas.getByText('Build complete')).toBeVisible();
		await userEvent.click(row);
		await expect(canvas.getByText('Build complete')).not.toBeVisible();
		await expect(canvas.getByText('Build output')).toBeVisible();
	}}
>
	<div class="w-64 rounded-card bg-surface p-3 text-sm">
		<Disclosure open>
			{#snippet heading()}Build{/snippet}
			<Disclosure class="mt-2 pl-4">
				{#snippet heading()}Build output{/snippet}
				<p class="pt-2 text-muted">Build complete</p>
			</Disclosure>
		</Disclosure>
	</div>
</Story>
