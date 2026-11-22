<script lang="ts">
	import type { JobState } from './JobMark.svelte';
	import ProgressIcon from './ProgressIcon.svelte';
	import RunningJob from './RunningJob.svelte';

	let {
		jobs,
		stateOf
	}: { jobs: { name: string; ports?: unknown[] }[]; stateOf: (name: string) => JobState } =
		$props();
	const running = $derived(jobs.filter((job) => stateOf(job.name) === 'running'));
</script>

<!-- something on its way up comes first: it answers the shortcut at once -->
{#if jobs.some((job) => stateOf(job.name) === 'starting')}
	<ProgressIcon label="Job starting" class="size-3.5" />
{:else if running.length > 0}
	<!-- something ready to be looked at, if anything is; else work going on -->
	<RunningJob
		label="Job running"
		listens={running.some((job) => (job.ports?.length ?? 1) > 0)}
		class="size-3.5"
	/>
{/if}
<span class="truncate">Tasks</span>
