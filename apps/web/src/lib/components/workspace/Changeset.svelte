<script lang="ts">
	import type { ReleaseNote, ReleasePackage, ReleasePlan } from '@geordi/protocol';
	import Badge from '#lib/ui/Badge.svelte';

	type Props = {
		/** What the worktree holds for the repository's next releases, as its release tool reads it. */
		plan: ReleasePlan;
		/** Opens a note's file as a diff. */
		onopen(path: string): void;
	};
	let { plan, onopen }: Props = $props();

	const mine = (pkg: ReleasePackage) => pkg.notes.filter((note) => note.added);
	// what this workspace changes about the next releases first; what was pending anyway after
	const touched = $derived(plan.packages.filter((pkg) => mine(pkg).length > 0));
	const others = $derived(
		plan.packages.filter(
			(pkg) => mine(pkg).length === 0 && (pkg.notes.length > 0 || pkg.problems.length > 0)
		)
	);
	const added = $derived(touched.reduce((count, pkg) => count + mine(pkg).length, 0));
</script>

{#snippet said(note: ReleaseNote)}
	<span class="mt-0.5 shrink-0 code-dense text-muted">
		{note.type}{#if note.breaking}<span class="text-danger">!</span>{/if}
	</span>
	<span class="line-clamp-3 min-w-0 flex-1 whitespace-pre-line">{note.body}</span>
{/snippet}

{#snippet release(pkg: ReleasePackage, quiet: boolean)}
	<li class="space-y-2 px-3.5 py-3">
		<div class="flex items-baseline gap-2">
			<p
				class={['min-w-0 flex-1 truncate text-sm font-medium', quiet && 'text-muted']}
				title={pkg.path}
			>
				{pkg.name ?? pkg.path}
			</p>
			<!-- where its notes take it, once they are released -->
			<p class="shrink-0 code-dense text-muted">
				{pkg.version}
				{#if pkg.nextVersion}
					<span class="icon-[lucide--arrow-right] size-3 align-middle"></span>
					<span class={quiet ? '' : 'text-ink'}>{pkg.nextVersion}</span>
				{/if}
			</p>
			{#if pkg.nextVersion}
				<Badge tone={quiet ? 'neutral' : 'accent'}>{pkg.bump}</Badge>
			{:else if pkg.notes.length > 0}
				<Badge>no bump</Badge>
			{/if}
		</div>

		<ul class="space-y-1.5">
			{#each pkg.notes as note (note.path)}
				<li>
					<!-- a note of this workspace's opens as a diff; one that was there before is just read -->
					{#if note.added}
						<button
							type="button"
							onclick={() => onopen(note.path)}
							title="Open {note.path}"
							class="flex w-full gap-2 rounded-control bg-surface px-2 py-1.5 text-left text-sm shadow-soft ring-1 ring-line/60 hover:shadow-float"
						>
							{@render said(note)}
						</button>
					{:else}
						<div
							class="flex gap-2 px-2 py-1 text-sm text-muted"
							title="{note.path} (pending before this workspace)"
						>
							{@render said(note)}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#each pkg.problems as problem (problem)}
			<p class="text-xs text-danger">{problem}</p>
		{/each}
	</li>
{/snippet}

<!--
	What this workspace means for the repository's next releases (FDR-007): the change notes
	it adds, and where they (with what was pending already) take each package's version.
-->
<section class="scroller" aria-label="Changeset">
	{#if plan.problem}
		<p class="px-3.5 py-3 text-sm text-muted">{plan.name} couldn't be asked: {plan.problem}.</p>
	{:else}
		<p class="px-3.5 pt-3 pb-1 text-sm text-muted">
			{#if added === 0}
				This workspace adds no change notes yet.
			{:else}
				Merging this workspace adds {added}
				{added === 1 ? 'change note' : 'change notes'}.
			{/if}
		</p>
		<ul class="divide-y divide-line/60">
			{#each touched as pkg (pkg.path)}{@render release(pkg, false)}{/each}
		</ul>
		{#if others.length > 0}
			<p class="border-t border-line px-3.5 pt-3 label">Pending without this workspace</p>
			<ul class="divide-y divide-line/60">
				{#each others as pkg (pkg.path)}{@render release(pkg, true)}{/each}
			</ul>
		{/if}
	{/if}
</section>
