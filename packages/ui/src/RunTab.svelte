<script lang="ts">
	import type { JobState } from './JobMark.svelte';
	import ProgressIcon from './ProgressIcon.svelte';
	import RunningJob from './RunningJob.svelte';

	/** What the Tasks tab shows of the tasks that run something: whether any is starting, or runs. */
	let {
		tasks,
		stateOf
	}: { tasks: { name: string; ports?: unknown[] }[]; stateOf: (name: string) => JobState } =
		$props();
	const running = $derived(tasks.filter((task) => stateOf(task.name) === 'running'));
</script>

<!-- something on its way up comes first: it answers the shortcut at once -->
{#if tasks.some((task) => stateOf(task.name) === 'starting')}
	<ProgressIcon label="Job starting" class="size-3.5" />
{:else if running.length > 0}
	<!-- something ready to be looked at, if anything is; else work going on -->
	<RunningJob
		label="Job running"
		listens={running.some((task) => (task.ports?.length ?? 1) > 0)}
		class="size-3.5"
	/>
{/if}
<span class="truncate">Tasks</span>
