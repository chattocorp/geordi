<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { fn } from 'storybook/test';
	import JobStatus from './JobStatus.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/Job status',
		component: JobStatus,
		args: { start: fn(), stop: fn() }
	});
</script>

<Story name="Starting" args={{ state: 'starting' }} />
<Story name="Running" args={{ state: 'running' }} />
<Story name="Failed" args={{ state: { ended: 1 } }} />
