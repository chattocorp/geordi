<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import WorkspaceActivity from '@geordi/ui/WorkspaceActivity.svelte';
	const { Story } = defineMeta({
		title: 'UI/Workspace activity',
		component: WorkspaceActivity
	});
</script>

<Story name="Agent working" args={{ activity: 'working' }} />
<Story name="Job running" args={{ activity: 'jobs', jobs: ['tests'] }} />
<Story name="Merging" args={{ activity: 'merge-pull' }} />
<Story name="Fixing" args={{ activity: 'fix-checks' }} />
<Story name="Archiving" args={{ activity: 'archive' }} />
<Story name="Syncing" args={{ activity: 'merge-upstream' }} />
