<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OpenInButton from './OpenInButton.svelte';
	import TitleBar from '@geordi/ui/TitleBar.svelte';
	const apps = [{ id: 'zed', name: 'Zed', command: 'zed .', enabled: true }];
	const { Story } = defineMeta({ title: 'Geordi/Workspace/Open in', component: OpenInButton });
</script>

<Story name="Workspace header" asChild>
	<TitleBar>
		<h1 class="truncate heading">Improve workspace navigation</h1>
		{#snippet actions()}<OpenInButton {apps} onlaunch={() => {}} onconfigure={() => {}} />{/snippet}
	</TitleBar>
</Story>
