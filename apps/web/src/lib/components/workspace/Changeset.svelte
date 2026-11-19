<script lang="ts">
	import type { ReleasePackage, ReleasePlan } from '@geordi/protocol';
	import { problemOf } from '#lib/problem.ts';
	import Markdown from '#lib/components/Markdown.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';

	type Props = {
		/** What the worktree holds for the repository's next releases, as its release tool reads it. */
		plan: ReleasePlan;
		/** Opens a note's file as a diff. */
		onopen(path: string): void;
		onsave(path: string, original: string, body: string): Promise<void>;
		/** The person agrees to the tool being asked in this repository, by running `command`. */
		onallow(command: string): void;
	};
	let { plan, onopen, onallow, onsave }: Props = $props();

	let editing = $state<string | null>(null);
	let original = $state('');
	let draft = $state('');
	let saving = $state(false);
	let problem = $state('');
	function edit(path: string, body: string) {
		editing = path;
		original = draft = body;
		problem = '';
	}
	async function save(path: string) {
		saving = true;
		problem = '';
		try {
			await onsave(path, original, draft);
			editing = null;
		} catch (error) {
			problem = problemOf(error, 'Could not save the note.');
		} finally {
			saving = false;
		}
	}

	const mine = (pkg: ReleasePackage) => pkg.notes.filter((note) => note.added);
	// only what this workspace changes about the next releases: that is what it is about
	const touched = $derived(plan.packages.filter((pkg) => mine(pkg).length > 0));
	const added = $derived(touched.reduce((count, pkg) => count + mine(pkg).length, 0));
	const troubled = $derived(plan.packages.filter((pkg) => pkg.problems.length > 0));
</script>

{#snippet release(pkg: ReleasePackage)}
	{@const before = pkg.notes.length - mine(pkg).length}
	<li class="space-y-3 px-3.5 py-3">
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
					<div class="flex items-center gap-1 pb-2">
						<button
							type="button"
							onclick={() => onopen(note.path)}
							title="Open {note.path}"
							class="group flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
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
						{#if !touched.some((pkg) => mine(pkg).some((n) => n.path === editing))}
							<Button
								label="Edit {note.path.split('/').at(-1)}"
								size="sm"
								variant="ghost"
								icon="icon-[lucide--pencil]"
								onclick={() => edit(note.path, note.body)}
							/>
						{/if}
					</div>
					{#if editing === note.path}
						<textarea
							class="w-full input"
							aria-label="Change note text"
							rows="5"
							bind:value={draft}
							disabled={saving}
							{@attach (element) => {
								element.focus();
							}}></textarea>
						{#if problem}<p role="alert" class="text-xs text-danger">{problem}</p>{/if}
						<div class="mt-2 flex justify-end gap-2">
							<Button size="sm" variant="ghost" disabled={saving} onclick={() => (editing = null)}
								>Cancel</Button
							>
							<Button
								size="sm"
								variant="primary"
								busy={saving}
								disabled={!draft.trim() || draft === original}
								onclick={() => save(note.path)}>Save</Button
							>
						</div>
					{:else}
						<Markdown text={note.body} />
					{/if}
				</li>
			{/each}
		</ul>
	</li>
{/snippet}

<!--
	What this workspace means for the repository's next releases (FDR-007): the change notes
	it adds, and where they take each package's version. Not what was pending without it.
-->
<!-- set like the changes beside it: a line that says how things stand, then what there is -->
<section class="flex min-h-0 flex-1 flex-col" aria-label="Changeset">
	<header class="flex items-center gap-2 px-3.5 py-2.5 text-sm text-muted">
		<span class="icon-[lucide--package] size-4 shrink-0"></span>
		<span class="min-w-0 flex-1 truncate">
			{#if plan.ask}
				{plan.name} hasn't been asked yet
			{:else if plan.problem}
				{plan.name} couldn't be asked
			{:else if added === 0}
				No change notes for {plan.name} yet
			{:else}
				{added}
				{added === 1 ? 'change note' : 'change notes'} for {plan.name}, in
				{touched.length}
				{touched.length === 1 ? 'package' : 'packages'}
			{/if}
		</span>
	</header>
	<div class="scroller py-1.5">
		{#if plan.ask}
			{@const ask = plan.ask}
			<!-- asked once per repository: the tool runs as the person, where the agent can write -->
			<div class="space-y-3 px-3.5 py-2 text-sm">
				<p class="text-muted">
					This repository uses {plan.name}. To show what this workspace means for its next releases,
					Geordi runs this in the workspace's directory, as you:
				</p>
				<pre class="rounded-control bg-sunken p-3 code-dense">{ask}</pre>
				<Button size="sm" onclick={() => onallow(ask)}>Allow in this repository</Button>
			</div>
		{:else if plan.problem}
			<p class="px-3.5 py-2 text-sm text-muted">
				{plan.name} couldn't be asked: {plan.problem}.
			</p>
		{:else}
			{#if added === 0}
				<p class="px-3.5 py-2 text-sm text-muted">
					Notes this workspace adds will show here, with the versions they lead to.
				</p>
			{/if}
			<ul class="divide-y divide-line/60">
				{#each touched as pkg (pkg.path)}{@render release(pkg)}{/each}
			</ul>
			{#each troubled as pkg (pkg.path)}
				{#each pkg.problems as problem (problem)}
					<p class="px-3.5 py-1 text-xs text-danger">{pkg.name ?? pkg.path}: {problem}</p>
				{/each}
			{/each}
		{/if}
	</div>
</section>
