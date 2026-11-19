<script module lang="ts">
	import { expect, fn } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Changes from '@geordi/ui/Changes.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Changes', component: Changes });
	const pending = {
		changes: null,
		unavailable: null,
		missing: false,
		upstream: null,
		config: null,
		release: null
	};
</script>

<Story
	name="Waiting for local Git"
	args={{ git: pending, onopen: fn() }}
	play={async ({ canvas }) => {
		await expect(canvas.getByText('Loading…')).toBeVisible();
	}}
/>

<Story
	name="Open a file while upstream is pending"
	args={{
		git: {
			...pending,
			changes: {
				branch: 'feature',
				comparisonTarget: 'main',
				uncommitted: 1,
				unpushed: null,
				landed: false,
				files: [{ path: 'message.txt', status: 'modified', added: 1, removed: 1 }]
			}
		},
		onopen: fn()
	}}
	play={async ({ canvas, userEvent, args }) => {
		await expect(canvas.getByText('main')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: /message.txt/ }));
		await expect(args.onopen).toHaveBeenCalledWith('message.txt');
	}}
/>

<Story name="Long paths in a narrow pane" asChild>
	<div class="w-80">
		<Changes
			git={{
				...pending,
				changes: {
					branch: 'feature',
					comparisonTarget: 'main',
					uncommitted: 0,
					unpushed: null,
					landed: false,
					files: [
						{
							path: 'docs/adr/ADR-124-atproto-handle-verification-needs-an-issuer.md',
							status: 'modified',
							added: 7,
							removed: 4
						},
						{
							path: 'docs/adr/very/deeply/nested/directories/INDEX.md',
							status: 'modified',
							added: 2,
							removed: 1
						},
						{ path: 'docs/GLOSSARY.md', status: 'modified', added: 3, removed: 1 }
					]
				}
			}}
			onopen={() => {}}
		/>
	</div>
</Story>

<Story name="No changes yet" asChild>
	<div class="flex h-96 w-80 flex-col">
		<Changes
			git={{
				...pending,
				changes: {
					branch: 'feature',
					comparisonTarget: 'main',
					uncommitted: 0,
					unpushed: null,
					landed: false,
					files: []
				}
			}}
			onopen={() => {}}
		/>
	</div>
</Story>
