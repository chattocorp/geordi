<script module lang="ts">
	import { expect, fireEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ContextMenu from './ContextMenu.svelte';
	import { contextMenu } from './menu.svelte.ts';

	const { Story } = defineMeta({ title: 'UI/ContextMenu', component: ContextMenu });
</script>

<script lang="ts">
	let last = $state('nothing yet');
</script>

<Story
	name="On an element"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await fireEvent.contextMenu(canvas.getByText('Right-click me'));
		await expect(await canvas.findByRole('menuitem', { name: 'Merge PR' })).toHaveFocus();
	}}
>
	<div class="flex flex-col items-start gap-3">
		<div
			class="card px-4 py-3 text-sm"
			{@attach contextMenu(() => [
				{
					label: 'Merge PR',
					icon: 'icon-[lucide--git-merge]',
					tone: 'ok',
					onselect: () => (last = 'Merge PR')
				},
				{
					label: 'Fix errors',
					icon: 'icon-[lucide--wrench]',
					tone: 'accent',
					onselect: () => (last = 'Fix errors')
				},
				'separator',
				{ label: 'Open', icon: 'icon-[lucide--external-link]', onselect: () => (last = 'Open') },
				{ label: 'Copy', icon: 'icon-[lucide--copy]', onselect: () => (last = 'Copy') },
				{ label: 'Not now', icon: 'icon-[lucide--clock]', disabled: true, onselect: () => {} },
				'separator',
				{
					label: 'Archive',
					icon: 'icon-[lucide--archive]',
					tone: 'merged',
					onselect: () => (last = 'Archive')
				},
				{
					label: 'Delete',
					icon: 'icon-[lucide--trash-2]',
					tone: 'danger',
					onselect: () => (last = 'Delete')
				}
			])}
		>
			Right-click me
		</div>
		<p class="text-sm text-muted">Chosen: {last}</p>
		<!-- once per app, in the layout -->
		<ContextMenu />
	</div>
</Story>
