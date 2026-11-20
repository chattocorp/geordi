<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Keys from '@geordi/ui/Keys.svelte';

	const { Story } = defineMeta({ title: 'UI/Keys', component: Keys });
</script>

<Story name="Shortcuts" asChild>
	<div class="flex flex-col items-start gap-3 text-sm">
		<span class="flex items-center gap-3">Run default tasks <Keys id="runDefault" /></span>
		<span class="flex items-center gap-3">New workspace <Keys id="newWorkspace" /></span>
		<span class="flex items-center gap-3"
			>New workspace, choosing its repository <Keys id="newWorkspaceIn" /></span
		>
		<span class="flex items-center gap-3">Open the settings <Keys id="settings" /></span>
	</div>
</Story>

<Story name="Mac shortcut" args={{ id: 'runDefault', mac: true }} />
