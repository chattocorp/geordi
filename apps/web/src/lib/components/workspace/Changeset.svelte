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
	<!-- held to a width that reads well, however wide the pane is -->
	<li class="max-w-prose space-y-4 px-5 py-5">
		<header class="space-y-1">
			<div class="flex items-center gap-2">
				<h3 class="min-w-0 flex-1 truncate heading" title={pkg.path}>{pkg.name ?? pkg.path}</h3>
				{#if pkg.nextVersion}<Badge tone="accent">{pkg.bump}</Badge>{:else}<Badge>no bump</Badge
					>{/if}
			</div>
			<!-- where its notes take it, once they are released -->
			<p class="flex items-center gap-1.5 code-dense text-muted">
				{pkg.version}
				{#if pkg.nextVersion}
					<span class="icon-[lucide--arrow-right] size-3"></span>
					<span class="text-ink">{pkg.nextVersion}</span>
				{/if}
			</p>
		</header>

		<!-- each note as it will read in the changelog: what kind of change, then what it says -->
		<ul class="space-y-2">
			{#each mine(pkg) as note (note.path)}
				<li class="space-y-1.5 rounded-card bg-sunken px-4 py-3">
					<button
						type="button"
						onclick={() => onopen(note.path)}
						title="Open {note.path}"
						class={[
							'flex items-center gap-0.5 text-xs font-semibold tracking-wider uppercase hover:text-ink',
							note.breaking ? 'text-danger' : 'text-muted'
						]}
					>
						{note.type}{#if note.breaking && note.type !== 'breaking'}, breaking{/if}
						<span class="icon-[lucide--chevron-right] size-3"></span>
					</button>
					<Markdown text={note.body} dense />
				</li>
			{/each}
		</ul>

		{#if before > 0 && pkg.nextVersion}
			<!-- why the step may be bigger than this workspace's notes alone would make it -->
			<p class="text-xs text-muted">
				The next version also counts {before}
				{before === 1 ? 'note that was' : 'notes that were'} pending already.
			</p>
		{/if}
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
		<div class="max-w-prose space-y-3 px-5 py-4 text-sm">
			<p class="text-muted">
				This repository uses {plan.name}. To show what this workspace means for its next releases,
				Geordi runs this in the workspace's directory, as you:
			</p>
			<pre class="rounded-control bg-sunken p-3 code-dense">{ask}</pre>
			<Button size="sm" onclick={() => onallow(ask)}>Allow in this repository</Button>
		</div>
	{:else if plan.problem}
		<p class="max-w-prose px-5 py-4 text-sm text-muted">
			{plan.name} couldn't be asked: {plan.problem}.
		</p>
	{:else}
		<p class="px-5 pt-4 text-sm text-muted">
			{#if added === 0}
				This workspace adds no change notes yet.
			{:else}
				Merging this workspace adds {added}
				{added === 1 ? 'change note' : 'change notes'}.
			{/if}
		</p>
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
