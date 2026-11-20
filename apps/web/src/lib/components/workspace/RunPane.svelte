<script lang="ts">
	import type { Job, Link } from '@geordi/protocol';
	import Button from '@geordi/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import JobMark, { type JobState } from './JobMark.svelte';

	/**
	 * The repository's links and jobs (FDR-006), and how each is: what a workspace runs, in
	 * one place. A row is the way to what it stands for: a link opens, a job that has a
	 * terminal shows it. Starting and stopping is at a job's end.
	 */
	let {
		jobs,
		links,
		stateOf,
		start,
		stop,
		show,
		visit,
		problem = null
	}: {
		jobs: Job[];
		links: Link[];
		stateOf: (job: string) => JobState;
		start: (names: string[]) => void;
		stop: (name: string) => void;
		/** Brings a job's terminal to the front. */
		show: (name: string) => void;
		visit: (link: Link) => void;
		problem?: string | null;
	} = $props();

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

<div class="scroller flex flex-col gap-3 p-2">
	{#if problem}
		<Notice>The repository's configuration can't be read: {problem}</Notice>
	{/if}

	{#if links.length > 0}
		<section aria-label="Open">
			{@render heading('Open')}
			{#each links as link (link.name)}
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
					<span class="min-w-0 flex-1 truncate text-ink">{link.label ?? link.name}</span>
					<span
						class="hidden max-w-1/2 shrink-0 truncate code-dense text-xs text-muted group-hover/link:inline group-focus-visible/link:inline"
						>{where(link.href)}</span
					>
				</button>
			{/each}
		</section>
	{/if}

	{#if jobs.length > 0}
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
			{#each jobs as job (job.name)}
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
								class="grid place-items-center group-hover/job:hidden group-focus-visible/mark:hidden"
							>
								<JobMark {state} />
							</span>
						{/if}
						<span
							class={[
								'size-3.5',
								state !== 'stopped' &&
									'hidden group-hover/job:block group-focus-visible/mark:block',
								live(state) ? 'icon-[lucide--circle-stop] text-danger' : 'icon-[lucide--play]'
							]}
						></span>
					</button>
					<!-- once it has a terminal, the rest of the row is the way to its output -->
					{#if state === 'stopped'}
						<div class="flex min-w-0 flex-1 items-center gap-2 text-sm" title={job.command}>
							{@render about(job)}
						</div>
					{:else}
						<button
							type="button"
							title="Show the output of {name}"
							onclick={() => show(job.name)}
							class="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-sm"
						>
							{@render about(job)}
						</button>
					{/if}
				</div>
			{/each}
		</section>
	{/if}
</div>
