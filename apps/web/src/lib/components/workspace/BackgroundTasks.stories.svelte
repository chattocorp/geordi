<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BackgroundTasks from './BackgroundTasks.svelte';

	const { Story } = defineMeta({ title: 'Workspace/BackgroundTasks', component: BackgroundTasks });

	const rows = [
		{
			task: { type: 'terminal' as const, id: 't1', stopId: 's1' },
			label: 'RUN=451600851 pnpm test --watch',
			kind: 'Terminal'
		},
		{
			task: { type: 'subagent' as const, id: 'a1' },
			label: 'Review the diff',
			kind: 'Subagent'
		}
	];
</script>

<Story name="Folded" asChild>
	<BackgroundTasks {rows} withComposer={false} onstoptask={async () => {}} />
</Story>
