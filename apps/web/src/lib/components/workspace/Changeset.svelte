<script lang="ts">
	import type { ReleasePackage, ReleasePlan } from '@geordi/protocol';
	import Markdown from '#lib/components/Markdown.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';

	type Props = {
		/** What the worktree holds for the repository's next releases, as its release tool reads it. */
		plan: ReleasePlan;
		/** Opens a note's file as a diff. */
		onopen(path: string): void;
		/** The person agrees to the tool being asked in this repository, by running `command`. */
		onallow(command: string): void;
	};
	let { plan, onopen, onallow }: Props = $props();

	const mine = (pkg: ReleasePackage) => pkg.notes.filter((note) => note.added);
	// only what this workspace changes about the next releases: that is what it is about
	const touched = $derived(plan.packages.filter((pkg) => mine(pkg).length > 0));
	const added = $derived(touched.reduce((count, pkg) => count + mine(pkg).length, 0));
	const troubled = $derived(plan.packages.filter((pkg) => pkg.problems.length > 0));
</script>

{#snippet release(pkg: ReleasePackage)}
	{@const before = pkg.notes.length - mine(pkg).length}
	<li class="space-y-3 px-5 py-5">
		<header class="flex items-center gap-3">
			<div class="min-w-0 flex-1">
				<h3 class="truncate heading" title={pkg.path}>{pkg.name ?? pkg.path}</h3>
				{#if before > 0 && pkg.nextVersion}
					<!-- why the step may be bigger than this workspace's notes alone would make it -->
					<p class="truncate text-xs text-muted">
						with {before}
						{before === 1 ? 'note' : 'notes'} pending already
					</p>
				{/if}
			</div>
			<!-- where its notes take it, once they are released -->
			<p class="flex shrink-0 items-center gap-1.5 code-dense text-muted">
				{pkg.version}
				{#if pkg.nextVersion}
					<span class="icon-[lucide--arrow-right] size-3"></span>
					<span class="font-medium text-ink">{pkg.nextVersion}</span>
				{/if}
			</p>
			{#if pkg.nextVersion}<Badge tone="accent">{pkg.bump}</Badge>{:else}<Badge>no bump</Badge>{/if}
		</header>

		<!-- each note as it will read in the changelog: what kind of change, then what it says -->
		<ul class="space-y-2">
			{#each mine(pkg) as note (note.path)}
				<li class="rounded-card bg-sunken px-4 pt-2.5 pb-3.5">
					<!-- its kind, and the file it is: which opens as a diff -->
					<button
						type="button"
						onclick={() => onopen(note.path)}
						title="Open {note.path}"
						class="group flex w-full items-center gap-2 pb-2 text-left text-xs"
					>
						<span class={['dot', note.breaking ? 'bg-danger' : 'bg-accent']}></span>
						<span
							class={[
								'font-medium first-letter:uppercase',
								note.breaking ? 'text-danger' : 'text-ink'
							]}
						>
							{note.type}{#if note.breaking && note.type !== 'breaking'}, breaking{/if}
						</span>
						<span
							class="min-w-0 flex-1 truncate text-right code-dense text-muted group-hover:text-ink"
						>
							{note.path.split('/').at(-1)}
						</span>
						<span
							class="icon-[lucide--chevron-right] size-3 shrink-0 text-muted group-hover:text-ink"
						></span>
					</button>
					<!-- set as the conversation is: the same text, the same way -->
					<Markdown text={note.body} />
				</li>
			{/each}
		</ul>
	</li>
{/snippet}

<!--
	What this workspace means for the repository's next releases (FDR-007): the change notes
	it adds, and where they take each package's version. Not what was pending without it.
-->
<section class="scroller" aria-label="Changeset">
	{#if plan.ask}
		{@const ask = plan.ask}
		<!-- asked once per repository: the tool runs as the person, where the agent can write -->
		<div class="space-y-3 px-5 py-4 text-sm">
			<p class="text-muted">
				This repository uses {plan.name}. To show what this workspace means for its next releases,
				Geordi runs this in the workspace's directory, as you:
			</p>
			<pre class="rounded-control bg-sunken p-3 code-dense">{ask}</pre>
			<Button size="sm" onclick={() => onallow(ask)}>Allow in this repository</Button>
		</div>
	{:else if plan.problem}
		<p class="px-5 py-4 text-sm text-muted">
			{plan.name} couldn't be asked: {plan.problem}.
		</p>
	{:else}
		{#if added === 0}
			<p class="px-5 py-4 text-sm text-muted">This workspace adds no change notes yet.</p>
		{/if}
		<ul class="divide-y divide-line/60">
			{#each touched as pkg (pkg.path)}{@render release(pkg)}{/each}
		</ul>
		{#each troubled as pkg (pkg.path)}
			{#each pkg.problems as problem (problem)}
				<p class="px-5 py-1 text-xs text-danger">{pkg.name ?? pkg.path}: {problem}</p>
			{/each}
		{/each}
	{/if}
</section>
