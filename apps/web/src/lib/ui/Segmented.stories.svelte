<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Segmented from '@geordi/ui/Segmented.svelte';

	const { Story } = defineMeta({ title: 'UI/Segmented', component: Segmented });

	let value = $state('system');
	let view = $state('list');
	let mode = $state('preview');
</script>

<Story name="Choices" asChild>
	<Segmented
		label="Theme"
		bind:value
		options={[
			{ value: 'system', label: 'System', icon: 'icon-[lucide--monitor]' },
			{ value: 'light', label: 'Light', icon: 'icon-[lucide--sun]' },
			{ value: 'dark', label: 'Dark', icon: 'icon-[lucide--moon]' }
		]}
	/>
</Story>

<Story name="Small" asChild>
	<Segmented
		label="Theme"
		size="sm"
		bind:value
		options={[
			{ value: 'system', label: 'System' },
			{ value: 'light', label: 'Light' },
			{ value: 'dark', label: 'Dark' }
		]}
	/>
</Story>

<Story name="Icons" asChild>
	<div class="flex items-center gap-4">
		<Segmented
			label="Show the changes"
			icons
			bind:value={view}
			options={[
				{ value: 'list', label: 'As a list', icon: 'icon-[lucide--list]' },
				{ value: 'tree', label: 'As a tree', icon: 'icon-[lucide--list-tree]' }
			]}
		/>
		<Segmented
			label="Show the file"
			icons
			size="sm"
			bind:value={mode}
			options={[
				{ value: 'preview', label: 'Preview', icon: 'icon-[lucide--eye]' },
				{ value: 'source', label: 'Source', icon: 'icon-[lucide--code]' }
			]}
		/>
	</div>
</Story>
