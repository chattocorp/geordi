<script lang="ts">
	import type { Job } from '@geordi/protocol';
	import type { JobState } from './JobMark.svelte';
	import ProgressIcon from './ProgressIcon.svelte';
	import RunningJob from './RunningJob.svelte';

	let { jobs, stateOf }: { jobs: Job[]; stateOf: (name: string) => JobState } = $props();
</script>

<!-- something on its way up comes first: it answers the shortcut at once -->
{#if jobs.some((job) => stateOf(job.name) === 'starting')}
	<ProgressIcon label="Job starting" class="size-3.5" />
{:else if jobs.some((job) => stateOf(job.name) === 'running')}
	<RunningJob label="Job running" class="size-3.5" />
{/if}
<span class="truncate">Tasks</span>
