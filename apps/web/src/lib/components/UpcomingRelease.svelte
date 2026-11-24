<script lang="ts">
	import Page from '#lib/ui/Page.svelte';
	import Markdown from './Markdown.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import type { RepositoryReleaseView } from '#lib/server/views.ts';
	import { problemOf } from '#lib/problem.ts';

	let {
		state: view,
		problem,
		onrefresh
	}: {
		state?: RepositoryReleaseView;
		problem?: string;
		onrefresh: (allow?: string) => Promise<void>;
	} = $props();
	const release = $derived(view?.release);
	const plan = $derived(release?.plan);
	const readProblem = $derived(release?.problem ?? plan?.problem);
	const packages = $derived(
		plan?.packages.filter((pkg) => pkg.nextVersion || pkg.notes.length || pkg.problems.length) ?? []
	);
	let busy = $state(false);
	let failed = $state('');
	async function refresh(allow?: string) {
		busy = true;
		failed = '';
		try {
			await onrefresh(allow);
		} catch (error) {
			failed = problemOf(error, 'Could not read the release plan.');
		} finally {
			busy = false;
		}
	}
</script>

<Page title="Upcoming release">
	{#snippet description()}
		<span class="inline-flex items-baseline gap-1.5">
			{view?.name ?? ''}{#if release?.branch}<span aria-hidden="true">·</span><span
					class="code-dense"
				>
					{release.branch}
				</span>{/if}
		</span>
	{/snippet}
	{#if problem}
		<p class="empty">{problem}</p>
	{:else if view && !view.online}
		<p class="empty">Waiting for the daemon to connect.</p>
	{:else if !release}
		<p class="empty">Loading release plan…</p>
	{:else if readProblem}
		<div class="space-y-3">
			<p class="text-sm text-danger">{readProblem}</p>
			<Button {busy} onclick={() => refresh()}>Retry</Button>
		</div>
	{:else if plan?.ask}
		<div class="space-y-3">
			<p>Allow {plan.name} to read the release plan for {view?.name}?</p>
			<p class="code text-muted">{plan.ask}</p>
			<Button {busy} onclick={() => refresh(plan?.ask ?? undefined)}>Allow {plan.name}</Button>
		</div>
	{:else if !plan}
		<p class="empty">No supported release tool on {release.branch}.</p>
	{:else if !packages.length}
		<p class="empty">No pending changes on {release.branch}.</p>
	{:else}
		<div class="space-y-8">
			{#each packages as pkg (pkg.path)}
				<section class="space-y-4">
					<header class="flex flex-wrap items-baseline gap-2">
						<h2 class="heading">{pkg.name ?? (pkg.path === '.' ? view?.name : pkg.path)}</h2>
						<span class="text-sm text-muted">
							{pkg.version}{#if pkg.nextVersion}
								→ <strong class="text-ink">{pkg.nextVersion}</strong>{/if}
						</span>
					</header>
					{#each pkg.problems as issue, i (i)}<p class="text-sm text-danger">{issue}</p>{/each}
					{#if pkg.nextVersion && !pkg.notes.length}<p class="text-sm text-muted">
							{plan.name} includes this package without a separate change note.
						</p>{/if}
					{#each Map.groupBy(pkg.notes, (note) => note.type) as [kind, notes] (kind)}
						<div class="space-y-2">
							<h3 class="label first-letter:uppercase">{kind}</h3>
							<ul class="list-disc space-y-2 pl-5 marker:text-muted">
								{#each notes as note (note.path)}<li>
										{#if note.breaking}<span class="text-xs font-semibold text-danger">
												Breaking
											</span>{/if}
										<Markdown text={note.body} />
									</li>{/each}
							</ul>
						</div>
					{/each}
				</section>
			{/each}
		</div>
	{/if}
	{#if failed}<p role="alert" class="text-sm text-danger">{failed}</p>{/if}
</Page>
