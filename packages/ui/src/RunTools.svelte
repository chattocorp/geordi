<script lang="ts">
	import type { Task } from '@geordi/protocol';
	import Button from './Button.svelte';
	import type { JobState } from './JobMark.svelte';
	import { hint, type ShortcutId } from './keys.ts';

	/**
	 * What is done with all of a repository's tasks (FDR-006), in the Tasks tab itself: running
	 * the default tasks (what the shortcut does), and stopping everything that runs.
	 */
	let {
		tasks,
		shortcut,
		stateOf,
		runDefault,
		stop
	}: {
		tasks: Task[];
		/** Named in the run button's title: what else does. */
		shortcut?: ShortcutId;
		stateOf: (task: string) => JobState;
		/** Runs the default tasks, together. */
		runDefault: () => void;
		stop: (task: string) => void;
	} = $props();

	const defaults = $derived(tasks.filter((task) => task.default));
	const live = (state: JobState) => state === 'running' || state === 'starting';
	const running = $derived(tasks.filter((task) => task.command && live(stateOf(task.name))));
	const name = $derived(
		defaults.length === 1 ? (defaults[0].label ?? defaults[0].name) : 'default tasks'
	);
</script>

{#if defaults.length}
	<Button
		variant="ghost"
		size="sm"
		icon="icon-[lucide--play]"
		label="Run {name}{shortcut ? ` (${hint(shortcut)})` : ''}"
		aria-label="Run {name}"
		onclick={runDefault}
	/>
{/if}
{#if running.length}
	<Button
		variant="ghost"
		size="sm"
		icon="icon-[lucide--circle-stop]"
		label="Stop all"
		onclick={() => running.forEach((task) => stop(task.name))}
	/>
{/if}
