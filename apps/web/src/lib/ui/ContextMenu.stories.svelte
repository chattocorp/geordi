<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ContextMenu from './ContextMenu.svelte';
	import { contextMenu } from './menu.svelte.ts';

	const { Story } = defineMeta({ title: 'UI/ContextMenu', component: ContextMenu });
</script>

<script lang="ts">
	let last = $state('nothing yet');
</script>

<Story name="On an element" asChild>
	<div class="flex flex-col items-start gap-3">
		<div
			class="card px-4 py-3 text-sm"
			{@attach contextMenu(() => [
				{ label: 'Open', icon: 'icon-[lucide--arrow-up-right]', onselect: () => (last = 'Open') },
				{ label: 'Copy', icon: 'icon-[lucide--copy]', onselect: () => (last = 'Copy') },
				{ label: 'Not now', icon: 'icon-[lucide--clock]', disabled: true, onselect: () => {} },
				'separator',
				{
					label: 'Delete',
					icon: 'icon-[lucide--trash-2]',
					danger: true,
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
