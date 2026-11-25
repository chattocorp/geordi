<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Task } from '@geordi/protocol';
	import Button from './Button.svelte';
	import JobMark, { type JobState } from './JobMark.svelte';
	import Loading from './Loading.svelte';
	import RowLabel from './RowLabel.svelte';
	import { persisted } from './persisted.svelte.ts';

	/**
	 * The repository's tasks (FDR-006), and how each is: what a workspace runs, in one place,
	 * the default tasks first, then the rest, each in the order the file has them (running the
	 * default tasks and stopping all is `RunTools`, in the tab). A
	 * task is a row: it runs the task (again) and opens its URL; pointing at it offers its
	 * terminal and stopping it, right after its name. Tasks whose labels begin alike
	 * (`Sorties / Ring 1`) are a group of their own, which folds; it stands where its first
	 * task would. What comes before them (a problem with the configuration, say) is `children`.
	 */
	let {
		tasks,
		stateOf,
		hasTerminal,
		run,
		stop,
		show,
		loading = false,
		children
	}: {
		tasks: Task[];
		stateOf: (task: string) => JobState;
		hasTerminal: (task: string) => boolean;
		/**
		 * Runs a task and opens its URL; `showTerminal`: and brings its terminal to the front
		 * once it starts.
		 */
		run: (task: string, showTerminal?: boolean) => void;
		stop: (task: string) => void;
		/** Brings a task's terminal to the front. */
		show: (task: string) => void;
		/** The repository's configuration isn't known yet: its tasks are still to come. */
		loading?: boolean;
		children?: Snippet;
	} = $props();

	const live = (state: JobState) => state === 'running' || state === 'starting';
	/** A label's group and its name in it: `Sorties / Ring 1` is `Ring 1` in `Sorties`. */
	function groupOf(task: Task): { group: string | null; label: string } {
		const label = task.label ?? task.name;
		const [, group, rest] = label.match(/^(.+?) \/ (.+)$/) ?? [];
		return group ? { group: group.trim(), label: rest.trim() } : { group: null, label };
	}
	type Entry =
		{ task: Task; label: string } | { group: string; tasks: { task: Task; label: string }[] };
	/** The default tasks first, by their full label; then the rest, a group where its first task is. */
	const entries = $derived.by(() => {
		const list: Entry[] = tasks
			.filter((task) => task.default)
			.map((task) => ({ task, label: task.label ?? task.name }));
		for (const task of tasks.filter((task) => !task.default)) {
			const { group, label } = groupOf(task);
			if (!group) {
				list.push({ task, label });
				continue;
			}
			const found = list.find((entry) => 'group' in entry && entry.group === group);
			if (found && 'group' in found) found.tasks.push({ task, label });
			else list.push({ group, tasks: [{ task, label }] });
		}
		return list;
	});
	/** Groups folded away, in this browser. */
	const folded = persisted<string[]>('geordi:tasks-folded', []);
	function fold(group: string, open: boolean) {
		const others = folded.current.filter((name) => name !== group);
		folded.current = open ? others : [...others, group];
	}
	/** How a folded group is, at a glance: starting if anything is, else running if anything is. */
	function groupState(names: string[]): JobState {
		const states = names.map(stateOf);
		if (states.includes('starting')) return 'starting';
		return states.includes('running') ? 'running' : 'stopped';
	}
	const byName = $derived(new Map(tasks.map((task) => [task.name, task])));
	/** The task pointed at, whose row and everything it needs stand out (as a parent in the sidebar). */
	let pointed = $state<string | null>(null);
	/** What the pointed-at task needs to run, and what that needs in turn. */
	/** Says which task is pointed at, by pointer or keyboard, while it is. */
	const pointing = (name: string) => (row: HTMLElement) => {
		const enter = () => (pointed = name);
		const leave = () => {
			if (pointed === name) pointed = null;
		};
		const events = [
			['pointerenter', enter],
			['focusin', enter],
			['pointerleave', leave],
			['focusout', leave]
		] as const;
		for (const [type, listener] of events) row.addEventListener(type, listener);
		return () => {
			for (const [type, listener] of events) row.removeEventListener(type, listener);
		};
	};
	const needed = $derived.by(() => {
		const found: string[] = [];
		const visit = (name: string) => {
			for (const need of byName.get(name)?.needs ?? [])
				if (!found.includes(need)) {
					found.push(need);
					visit(need);
				}
		};
		if (pointed) visit(pointed);
		return found;
	});
	/** Whether a task is up, as far as its URL goes: running, or nothing to run. */
	function ready(name: string): boolean {
		const task = byName.get(name);
		if (!task) return false;
		if (task.command) return stateOf(name) === 'running';
		return task.needs.every(ready);
	}
	function waiting(name: string): boolean {
		const task = byName.get(name);
		if (!task) return false;
		if (task.command) return stateOf(name) === 'starting';
		return task.needs.some(waiting);
	}
	const where = (href: string) => href.replace(/^https?:\/\//, '').replace(/\/$/, '');
</script>

<!-- `marked`: the row's mark already says the task is starting, so the link need not -->
{#snippet linkIcon(name: string, marked = false)}
	{#if !marked && waiting(name)}
		<JobMark state="starting" />
	{:else}
		<span
			class={['icon-[lucide--external-link] size-3.5', ready(name) ? 'text-accent' : 'text-muted']}
		></span>
	{/if}
{/snippet}

{#snippet taskRow(task: Task, label: string)}
	{@const state = stateOf(task.name)}
	{@const terminal = !!task.command && hasTerminal(task.name)}
	<!-- the URL of a task that runs something sits at the end of its row -->
	{@const inline = task.command ? task.href : null}
	<!-- a task that runs, or ran, shows what can be done with it and where it listens -->
	{@const active = terminal || (!!task.command && live(state))}
	<li>
		<div
			{@attach pointing(task.name)}
			class={[
				'group/task relative item h-8 gap-1 pr-1 pl-1 text-ink',
				needed.includes(task.name) && 'bg-hover'
			]}
		>
			<!-- the whole row runs the task (again, once it ended); a running one is reused. What
				is in the row lies over it, and lets clicks through but for its own buttons. -->
			<button
				type="button"
				aria-label="{task.command ? 'Run' : 'Open'} {label}"
				title={task.command ?? `Open ${task.href}`}
				onclick={() => run(task.name)}
				onmousedown={(event) => event.button === 1 && task.command && event.preventDefault()}
				onauxclick={(event) => {
					// a middle click goes to its terminal: running, from the last run, or about to start
					if (event.button !== 1 || !task.command) return;
					event.preventDefault();
					if (terminal) show(task.name);
					else run(task.name, true);
				}}
				class="absolute inset-0 rounded-control"
			></button>
			<!-- what is not running is quiet until one points at it, when it says the row runs it -->
			<span class="pointer-events-none grid size-6 shrink-0 place-items-center text-muted">
				{#if !task.command}{@render linkIcon(task.name)}
				{:else if !live(state)}
					<span class="grid group-hover/task:hidden group-has-focus-visible/task:hidden">
						<JobMark {state} />
					</span>
					<span
						class="icon-[lucide--play] hidden size-3.5 group-hover/task:block group-has-focus-visible/task:block"
					></span>
				{:else}<JobMark {state} listens={task.ports.length > 0} />{/if}
			</span>
			<span class="pointer-events-none min-w-0 truncate pr-1 text-ink">{label}</span>
			<!-- what follows the name: first its URL; then, for a task that runs or ran, what can be
				done with it and its ports; for the rest, these show where one points at it -->
			{#if inline}
				<button
					type="button"
					aria-label="Open {label}"
					title="Open {inline}"
					onclick={() => run(task.name)}
					class="relative grid size-6 shrink-0 place-items-center rounded-control hover:bg-hover"
				>
					{@render linkIcon(task.name, true)}
				</button>
			{/if}
			<!-- what can be done with it (its output, running or from the last run; stopping it) -->
			{#if active}
				<span class="relative flex shrink-0 items-center">
					{#if terminal}
						<Button
							variant="ghost"
							size="sm"
							icon="icon-[lucide--square-terminal]"
							label="Show terminal of {label}"
							onclick={() => show(task.name)}
						/>
					{/if}
					{#if task.command && live(state)}
						<Button
							variant="ghost"
							size="sm"
							icon="icon-[lucide--circle-stop]"
							label="Stop {label}"
							onclick={() => stop(task.name)}
						/>
					{/if}
				</span>
			{/if}
			<!-- where it is: the first to give way when there is no room -->
			<span
				class={[
					'pointer-events-none min-w-0 shrink-1000 truncate pl-1 code-dense text-xs text-muted',
					!active && 'hidden group-hover/task:inline group-has-focus-visible/task:inline'
				]}
			>
				{#if task.command}
					{task.ports.map(({ port }) => `:${port}`).join(' ')}
				{:else if task.href}
					{where(task.href)}
				{/if}
			</span>
		</div>
	</li>
{/snippet}

<div class="scroller flex flex-col gap-3 p-2">
	{@render children?.()}

	{#if loading}
		<Loading label="Loading the tasks…" />
	{:else if tasks.length > 0}
		<!-- a hair between rows, as in the sidebar: rows that stand out together stay apart -->
		<ul aria-label="Tasks" class="grouped-rows">
			{#each entries as entry ('group' in entry ? `group:${entry.group}` : entry.task.name)}
				{#if 'group' in entry}
					{@const names = entry.tasks.map(({ task }) => task.name)}
					{@const open = !folded.current.includes(entry.group)}
					<li data-group-start data-group-end>
						<div
							class={[
								'item h-8 pr-1 text-ink select-none',
								!open && names.some((name) => needed.includes(name)) && 'bg-hover'
							]}
						>
							<RowLabel
								title={entry.group}
								fold={{
									folded: !open,
									count: entry.tasks.length,
									toggle: () => fold(entry.group, !open)
								}}
								class="h-full pr-1 font-medium aria-[expanded=false]:not-hover:text-prose"
							>
								<!-- folded, it still says whether anything in it is at work -->
								{#if !open && groupState(names) !== 'stopped'}
									<JobMark
										state={groupState(names)}
										listens={entry.tasks.some(({ task }) => task.ports.length > 0)}
									/>
								{/if}
							</RowLabel>
						</div>
						<!-- its tasks, under the group's name -->
						{#if open}
							<ul aria-label={entry.group} class="mt-px space-y-px pl-4">
								{#each entry.tasks as { task, label } (task.name)}
									{@render taskRow(task, label)}
								{/each}
							</ul>
						{/if}
					</li>
				{:else}
					{@render taskRow(entry.task, entry.label)}
				{/if}
			{/each}
		</ul>
	{/if}
</div>
