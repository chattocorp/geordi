<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Task } from '@geordi/protocol';
	import Button from './Button.svelte';
	import JobMark, { type JobState } from './JobMark.svelte';
	import Keys from './Keys.svelte';
	import Loading from './Loading.svelte';
	import type { ShortcutId } from './keys.ts';

	/**
	 * The repository's tasks (FDR-006), and how each is: what a workspace runs, in one place,
	 * the default tasks first (what the shortcut runs), then the rest, each in the order the file
	 * has them. A task is a row: it runs the task (again) and opens its URL; pointing at it
	 * offers its terminal and stopping it. What
	 * comes before them (a problem with the configuration, say) is `children`.
	 */
	let {
		tasks,
		shortcut,
		stateOf,
		hasTerminal,
		run,
		stop,
		show,
		loading = false,
		children
	}: {
		tasks: Task[];
		/** Shown on the default tasks: what runs them. */
		shortcut?: ShortcutId;
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
	const ordered = $derived([
		...tasks.filter((task) => task.default),
		...tasks.filter((task) => !task.default)
	]);
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

{#snippet taskRow(task: Task)}
	{@const label = task.label ?? task.name}
	{@const state = stateOf(task.name)}
	{@const terminal = !!task.command && hasTerminal(task.name)}
	<!-- the URL of a task that runs something sits at the end of its row -->
	{@const inline = task.command ? task.href : null}
	<li>
		<div
			{@attach pointing(task.name)}
			class={[
				'group/task flex h-8 items-center gap-1 rounded-control pr-1 pl-0.5 hover:bg-hover',
				needed.includes(task.name) && 'bg-surface/60'
			]}
		>
			<!-- the row runs the task (again, once it ended); a running one is reused -->
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
				class="flex h-full min-w-0 flex-1 items-center gap-1 text-left text-sm"
			>
				<!-- what is not running is quiet until one points at it, when it says the row runs it -->
				<span class="grid size-6 shrink-0 place-items-center text-muted">
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
				<!-- the name comes first: what is shown on pointing gives way to it -->
				<span class="min-w-0 truncate text-ink">{label}</span>
				<span class="min-w-0 grow basis-0 truncate pl-1 text-right code-dense text-xs text-muted">
					<span class="hidden group-hover/task:inline group-has-focus-visible/task:inline">
						{#if task.command}
							{task.ports.map(({ port }) => `:${port}`).join(' ')}
						{:else if task.href}
							{where(task.href)}
						{/if}
					</span>
				</span>
				{#if task.default && shortcut}<span class="shrink-0"><Keys id={shortcut} /></span>{/if}
			</button>
			<!-- what can be done with it shows where one points at it (its output, running or from
				the last run; stopping it), taking no room at rest: the mark says how it is -->
			{#if terminal || (task.command && live(state))}
				<span
					class="hidden shrink-0 items-center group-focus-within/task:flex group-hover/task:flex"
				>
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
			<!-- its URL stays, at the very end: the one thing at rest beside the name -->
			{#if inline}
				<button
					type="button"
					aria-label="Open {label}"
					title="Open {inline}"
					onclick={() => run(task.name)}
					class="grid size-6 shrink-0 place-items-center rounded-control hover:bg-hover"
				>
					{@render linkIcon(task.name, true)}
				</button>
			{/if}
		</div>
	</li>
{/snippet}

<div class="scroller flex flex-col gap-3 p-2">
	{@render children?.()}

	{#if loading}
		<Loading label="Loading the tasks…" />
	{:else if tasks.length > 0}
		<!-- a hair between rows, as in the sidebar: rows that stand out together stay apart -->
		<ul aria-label="Tasks" class="space-y-px">
			{#each ordered as task (task.name)}
				{@render taskRow(task)}
			{/each}
		</ul>
	{/if}
</div>
