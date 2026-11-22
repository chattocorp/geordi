<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Task, TaskLink } from '@geordi/protocol';
	import Button from './Button.svelte';
	import JobMark, { type JobState } from './JobMark.svelte';
	import Keys from './Keys.svelte';
	import type { ShortcutId } from './keys.ts';

	/**
	 * The repository's tasks (FDR-006), and how each is: what a workspace runs, in one place,
	 * the default tasks first (what the shortcut runs), then the rest, each in the order the file
	 * has them. A task is a row, with its links under it. The row runs the task (again);
	 * a terminal icon beside it shows its output; a link runs its task and opens. What
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
		children
	}: {
		tasks: Task[];
		/** Shown on the default tasks: what runs them. */
		shortcut?: ShortcutId;
		stateOf: (task: string) => JobState;
		hasTerminal: (task: string) => boolean;
		/** Runs a task, or opens one of its links (`task.link`). */
		run: (ref: string) => void;
		stop: (task: string) => void;
		/** Brings a task's terminal to the front. */
		show: (task: string) => void;
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
	/** Whether a task is up, as far as its links go: running, or nothing to run. */
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
	/** A link's name: its label, else where it leads (a task's only link is named after the task). */
	const linkName = (task: Task, link: TaskLink) =>
		link.label ?? (link.name === task.name ? where(link.href) : link.name);
</script>

{#snippet linkIcon(name: string)}
	{#if waiting(name)}
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
	<!-- a task's only link sits at the end of its row; several are listed under it -->
	{@const inline = task.command && task.links.length === 1 ? task.links[0] : null}
	{@const links = !task.command ? task.links.slice(1) : inline ? [] : task.links}
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
				title={task.command ?? `Open ${task.links[0]?.href}`}
				onclick={() => run(task.name)}
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
						{:else if task.links[0]}
							{where(task.links[0].href)}
						{/if}
					</span>
				</span>
				{#if task.default && shortcut}<span class="shrink-0"><Keys id={shortcut} /></span>{/if}
			</button>
			<!-- what sits at the end of the rows keeps its place in every row, so that it lines up -->
			<span class="grid size-6 shrink-0 place-items-center">
				{#if inline}
					<button
						type="button"
						aria-label="Open {inline.label ?? label}"
						title="Open {inline.href}"
						onclick={() => run(`${task.name}.${inline.name}`)}
						class="grid size-6 place-items-center rounded-control hover:bg-hover"
					>
						{@render linkIcon(task.name)}
					</button>
				{/if}
			</span>
			<!-- its output, running or from the last run -->
			<span class="grid size-6 shrink-0 place-items-center">
				{#if terminal}
					<Button
						variant="ghost"
						size="sm"
						icon="icon-[lucide--square-terminal]"
						label="Show terminal of {label}"
						onclick={() => show(task.name)}
					/>
				{/if}
			</span>
			<!-- stopping shows where one points at what runs: the mark says that it does -->
			<span
				class="grid size-6 shrink-0 place-items-center opacity-0 group-hover/task:opacity-100 group-has-focus-visible/task:opacity-100"
			>
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
		</div>
		{#if links.length > 0}
			<ul>
				{#each links as link (link.name)}
					<li>
						<button
							type="button"
							aria-label="Open {linkName(task, link)}"
							title="Open {link.href}"
							onclick={() => run(`${task.name}.${link.name}`)}
							class="group/link flex h-7 w-full items-center gap-1 rounded-control pr-2 pl-6 text-left text-xs text-muted hover:bg-hover hover:text-ink"
						>
							<span class="grid size-6 shrink-0 place-items-center">
								{@render linkIcon(task.name)}
							</span>
							<span class="min-w-0 truncate">{linkName(task, link)}</span>
							{#if link.label}
								<span
									class="hidden min-w-0 grow basis-0 truncate pl-1 text-right code-dense text-xs text-muted group-hover/link:inline group-focus-visible/link:inline"
								>
									{where(link.href)}
								</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<div class="scroller flex flex-col gap-3 p-2">
	{@render children?.()}

	{#if tasks.length > 0}
		<ul aria-label="Tasks">
			{#each ordered as task (task.name)}
				{@render taskRow(task)}
			{/each}
		</ul>
	{/if}
</div>
