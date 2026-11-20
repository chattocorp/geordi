<script lang="ts">
	import type { Job } from '@geordi/protocol';
	import type { JobState } from './JobMark.svelte';
	import RunningJob from './RunningJob.svelte';

	let { jobs, stateOf }: { jobs: Job[]; stateOf: (name: string) => JobState } = $props();
</script>

{#if jobs.some((job) => stateOf(job.name) === 'running')}
	<RunningJob label="Job running" class="size-3.5" />
{/if}
<span class="truncate">Tasks</span>
