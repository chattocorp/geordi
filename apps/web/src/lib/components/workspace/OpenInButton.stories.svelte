<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OpenInButton from './OpenInButton.svelte';
	import Changes from '@geordi/ui/Changes.svelte';
	const apps = [{ id: 'zed', name: 'Zed', command: 'zed .', enabled: true }];
	const { Story } = defineMeta({ title: 'Geordi/Workspace/Open in', component: OpenInButton });
</script>

<Story name="Changes toolbar" asChild>
	<div class="max-w-sm sheet">
		<Changes git={{ changes: null, unavailable: null }} onopen={() => {}}>
			{#snippet appLauncher()}<OpenInButton
					{apps}
					onlaunch={() => {}}
					onconfigure={() => {}}
				/>{/snippet}
		</Changes>
	</div>
</Story>
