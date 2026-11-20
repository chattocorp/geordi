<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Job, Link, RepoConfig } from '@geordi/protocol';
	import Button from './Button.svelte';
	import JobMark, { type JobState } from './JobMark.svelte';

	/**
	 * The repository's links and jobs (FDR-006), and how each is: what a workspace runs, in
	 * one place. A row is the way to what it stands for: a link opens, a job that has a
	 * terminal shows it. Starting and stopping is at a job's end. What comes before them (a
	 * problem with the configuration, say) is `children`.
	 */
	let {
		tasks,
		launch,
		defaultAction,
		shortcut,
		jobs,
		links,
		stateOf,
		hasTerminal,
		start,
		stop,
		show,
		visit,
		children
	}: {
		tasks?: RepoConfig['tasks'];
		launch?: (names: string[]) => void;
		defaultAction?: RepoConfig['default'];
		shortcut?: string;
		jobs: Job[];
		links: Link[];
		stateOf: (job: string) => JobState;
		hasTerminal: (job: string) => boolean;
		start: (names: string[]) => void;
		stop: (name: string) => void;
		/** Brings a job's terminal to the front. */
		show: (name: string) => void;
		visit: (link: Link) => void;
		children?: Snippet;
	} = $props();

	const firstLink = $derived(links.find((link) => defaultAction === `urls.${link.name}`));
	const firstJob = $derived(jobs.find((job) => defaultAction === `jobs.${job.name}`));
	const otherLinks = $derived(links.filter((link) => link !== firstLink));
	const otherJobs = $derived(jobs.filter((job) => job !== firstJob));
	const live = (state: JobState) => state === 'running' || state === 'starting';
	const idle = $derived(jobs.filter((job) => !live(stateOf(job.name))));
	const up = $derived(jobs.filter((job) => live(stateOf(job.name))));
	/** A link that would open at once: what it needs is all up. */
	const ready = (link: Link) =>
		link.needs.length > 0 && link.needs.every((name) => stateOf(name) === 'running');
	const where = (href: string) => href.replace(/^https?:\/\//, '').replace(/\/$/, '');
</script>

{#snippet heading(title: string)}
	<h3 class="flex-1 px-2 py-1 label">{title}</h3>
{/snippet}

{#snippet about(job: Job)}
	<span class="min-w-0 flex-1 truncate text-ink">{job.label ?? job.name}</span>
	<span
		class="hidden shrink-0 code-dense text-xs text-muted group-hover/job:inline group-has-focus-visible/job:inline"
		>:{job.port}</span
	>
{/snippet}

{#snippet linkRow(link: Link, first = false)}
	<button
		type="button"
		title="Open {link.href}"
		onclick={() => visit(link)}
		class="group/link flex h-8 w-full items-center gap-1 rounded-control pr-2 pl-0.5 text-left text-sm hover:bg-hover"
	>
		<span class="grid size-6 shrink-0 place-items-center">
			{#if link.needs.some((name) => stateOf(name) === 'starting')}
				<JobMark state="starting" />
			{:else}
				<span
					class={[
						'icon-[lucide--external-link] size-3.5',
						ready(link) ? 'text-accent' : 'text-muted'
					]}
				></span>
			{/if}
		</span>
		<span class="min-w-0 flex-1 truncate text-ink"
			>{first ? 'Open ' : ''}{link.label ?? link.name}</span
		>
		<span
			class="hidden max-w-1/2 shrink-0 truncate code-dense text-xs text-muted group-hover/link:inline group-focus-visible/link:inline"
			>{where(link.href)}</span
		>
		{#if first && shortcut}<kbd class="shrink-0 text-base font-medium tracking-wide text-prose"
				>{shortcut}</kbd
			>{/if}
	</button>
{/snippet}

<div class="scroller flex flex-col gap-3 p-2">
	{@render children?.()}

	{#if tasks}
		{@const defaults = tasks.filter((task) => task.default)}
		{#if defaults.length}
			<button
				type="button"
				title={defaults.map((task) => task.label ?? task.name).join(', ')}
				class="item flex items-center gap-2 text-sm"
				onclick={() => launch?.(defaults.map((task) => task.name))}
			>
				<span class="icon-[lucide--play] size-4"></span>
				<span class="flex-1 text-left">Run defaults</span>
				<kbd class="text-muted">{shortcut}</kbd>
			</button>
		{/if}
		<section aria-label="Tasks">
			{@render heading('Tasks')}
			{#each tasks as task (task.name)}
				{@const job = jobs.find((job) => job.name === task.name)}
				{@const link = links.find((link) => link.name === task.name)}
				{@const label = task.label ?? task.name}
				{@const state = stateOf(task.name)}
				<div class="group/job flex h-8 items-center gap-1 rounded-control pr-1 hover:bg-hover">
					<button
						type="button"
						class="flex h-full min-w-0 flex-1 items-center gap-1 rounded-control text-left text-sm"
						title={link ? `Open ${link.href}` : job?.command}
						aria-label="{link ? 'Open' : 'Run'} {label}"
						onclick={() => launch?.([task.name])}
					>
						<span class="grid size-6 shrink-0 place-items-center text-muted">
							{#if link}<span class="icon-[lucide--external-link] size-3.5"></span>
							{:else if state === 'stopped'}<span class="icon-[lucide--play] size-3.5"></span>
							{:else}<JobMark {state} />{/if}
						</span>
						<span class="truncate">{label}</span>
					</button>
					{#if link && job && state !== 'stopped'}<JobMark {state} />{/if}
					{#if job && live(state)}
						<Button
							variant="ghost"
							size="sm"
							icon="icon-[lucide--circle-stop]"
							label="Stop {label}"
							onclick={() => stop(task.name)}
						/>
					{/if}
					{#if job && hasTerminal(task.name)}
						<Button
							variant="ghost"
							size="sm"
							icon="icon-[lucide--square-terminal]"
							label="Open terminal for {label}"
							onclick={() => show(task.name)}
						/>
					{/if}
				</div>
			{/each}
		</section>
	{:else}
		{#if firstLink || firstJob}
			<section aria-label="Default action">
				{@render heading('Default action')}
				{#if firstLink}
					{@render linkRow(firstLink, true)}
				{:else if firstJob}
					{@const job = firstJob}
					{@const state = stateOf(job.name)}
					{@const name = job.label ?? job.name}
					<div class="flex items-center">
						<button
							type="button"
							onclick={() => (live(state) ? stop(job.name) : start([job.name]))}
							class="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-control pr-2 pl-0.5 text-left text-sm hover:bg-hover"
						>
							<span class="grid size-6 shrink-0 place-items-center text-muted"
								>{#if state === 'stopped'}<span class="icon-[lucide--play] size-3.5"
									></span>{:else}<JobMark {state} />{/if}</span
							>
							<span class="flex-1 truncate">{live(state) ? 'Stop' : 'Start'} {name}</span>
							{#if shortcut}<kbd class="shrink-0 text-base font-medium tracking-wide text-prose"
									>{shortcut}</kbd
								>{/if}
						</button>
						{#if hasTerminal(job.name)}
							<Button
								variant="ghost"
								size="sm"
								icon="icon-[lucide--square-terminal]"
								label="Open terminal for {name}"
								onclick={() => show(job.name)}
							/>
						{/if}
					</div>
				{/if}
			</section>
		{/if}

		{#if otherLinks.length > 0}
			<section aria-label="Open">
				{@render heading('Open')}
				{#each otherLinks as link (link.name)}
					{@render linkRow(link)}
				{/each}
			</section>
		{/if}

		{#if otherJobs.length > 0}
			<section aria-label="Jobs">
				<div class="flex items-center gap-0.5 pr-0.5">
					{@render heading('Jobs')}
					{#if jobs.length > 1 && idle.length > 0}
						<Button
							size="sm"
							variant="ghost"
							icon="icon-[lucide--play]"
							label="Start all"
							onclick={() => start(idle.map((job) => job.name))}
						/>
					{/if}
					{#if up.length > 1}
						<Button
							size="sm"
							variant="ghost"
							icon="icon-[lucide--circle-stop]"
							label="Stop all"
							onclick={() => up.forEach((job) => stop(job.name))}
						/>
					{/if}
				</div>
				{#each otherJobs as job (job.name)}
					{@const state = stateOf(job.name)}
					{@const name = job.label ?? job.name}
					{@const action = live(state) ? 'Stop' : 'Start'}
					<div
						class="group/job flex h-8 items-center gap-1 rounded-control pr-2 pl-0.5 hover:bg-hover"
					>
						<!-- how it is; pointed at (or reached with the keyboard), what can be done about it -->
						<button
							type="button"
							aria-label="{action} {name}"
							title="{action} {name}"
							onclick={() => (live(state) ? stop(job.name) : start([job.name]))}
							class="group/mark grid size-6 shrink-0 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink"
						>
							{#if state !== 'stopped'}
								<span
									class="grid place-items-center group-hover/mark:hidden group-focus-visible/mark:hidden"
								>
									<JobMark {state} />
								</span>
							{/if}
							<span
								class={[
									'size-3.5',
									state !== 'stopped' &&
										'hidden group-hover/mark:block group-focus-visible/mark:block',
									live(state) ? 'icon-[lucide--circle-stop] text-danger' : 'icon-[lucide--play]'
								]}
							></span>
						</button>
						<!-- once it has a terminal, the rest of the row is the way to its output -->
						{#if !hasTerminal(job.name)}
							<div class="flex min-w-0 flex-1 items-center gap-2 text-sm" title={job.command}>
								{@render about(job)}
							</div>
						{:else}
							<button
								type="button"
								aria-label="Open terminal for {name}"
								title="Open terminal for {name}"
								onclick={() => show(job.name)}
								class="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-sm"
							>
								{@render about(job)}
								<span class="icon-[lucide--square-terminal] size-3.5 shrink-0 text-muted"></span>
							</button>
						{/if}
					</div>
				{/each}
			</section>
		{/if}
	{/if}
</div>
