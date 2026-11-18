<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import { actFromAfar } from '#lib/components/workspace/afar.svelte.ts';
	import { pendingPullAction } from '#lib/components/workspace/review.svelte.ts';
	import WorkspaceActions from '#lib/components/workspace/WorkspaceActions.svelte';
	import { timeAgo } from '#lib/format.ts';
	import WaitingForView from '#lib/components/WaitingForView.svelte';
	import { unread } from '#lib/notifications.svelte.ts';
	import { lanes, LANES, type Lane } from '#lib/overview.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import Button from '#lib/ui/Button.svelte';
	import Page from '#lib/ui/Page.svelte';
	import { persisted } from '#lib/persisted.svelte.ts';

	type Item = Navigation['workspaces'][number];

	/** The navigation view; undefined until it has come. `lost` while the connection is down. */
	let { nav, lost = false }: { nav: Navigation | undefined; lost?: boolean } = $props();

	const byLane = $derived(lanes(nav?.workspaces ?? [], unread));
	const repoNames = $derived(new Map(nav?.repos.map((repo) => [repo.id, repo.name])));

	const headings: Record<Lane, string> = {
		attention: 'Needs you',
		working: 'At work',
		open: 'Open',
		done: 'Done'
	};

	/** What the page says up top: how many of each, where there are any. */
	const summary = $derived(
		LANES.filter((lane) => byLane[lane].length > 0)
			.map((lane) => `${byLane[lane].length} ${headings[lane].toLowerCase()}`)
			.join(' · ')
	);

	/** The lanes folded away under their heading, as in the sidebar. */
	const folded = persisted<Lane[]>('geordi:overview-folded', []);
	const toggleFolded = (lane: Lane) =>
		(folded.current = folded.current.includes(lane)
			? folded.current.filter((other) => other !== lane)
			: [...folded.current, lane]);

	const open = (workspace: Item) => goto(resolve('/workspaces/[id]', { id: workspace.id }));

	// the times on the cards move on by themselves
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});
</script>

<Page title="Overview" wide>
	{#snippet description()}{nav ? summary || 'Nothing going on.' : ''}{/snippet}

	{#if !nav}
		<WaitingForView {lost} />
	{:else if nav.workspaces.length === 0}
		<div class="empty">
			<p class="pb-4">Nothing is going on. Tell an agent what to do.</p>
			<Button variant="primary" onclick={() => goto(resolve('/'))}>New workspace</Button>
		</div>
	{:else}
		<div class="space-y-10">
			{#each LANES as lane (lane)}
				{#if byLane[lane].length > 0}
					{@const isFolded = folded.current.includes(lane)}
					<section class="space-y-3">
						<h2 class="label">
							<button
								type="button"
								class="flex items-center gap-1.5 hover:text-ink"
								aria-expanded={!isFolded}
								onclick={() => toggleFolded(lane)}
							>
								{headings[lane]}
								{#if isFolded}
									<span class="font-normal text-muted/60 tabular-nums">{byLane[lane].length}</span>
								{/if}
								<span
									aria-hidden="true"
									class={[
										'icon-[lucide--chevron-right] size-3.5 transition-transform motion-reduce:transition-none',
										!isFolded && 'rotate-90'
									]}
								></span>
							</button>
						</h2>
						{#if !isFolded}
							<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{#each byLane[lane] as workspace (workspace.id)}
									{@render card(workspace)}
								{/each}
							</ul>
						{/if}
					</section>
				{/if}
			{/each}
		</div>
	{/if}
</Page>

<!--
	A workspace in brief: where it is, what it is, and its ribbon (how it stands, the next
	step), small. The whole card is the way into it; the ribbon's buttons sit above that.
-->
{#snippet card(workspace: Item)}
	<li class="relative flex flex-col gap-3 card p-4 card-link">
		<span class="flex items-center gap-2 text-xs text-muted">
			<span class="scale-80"><RepoIcon id={workspace.repoId} /></span>
			<span class="truncate">{repoNames.get(workspace.repoId)}</span>
			<span class="ml-auto shrink-0 tabular-nums">{timeAgo(workspace.updatedAt, now)}</span>
		</span>

		<a
			href={resolve('/workspaces/[id]', { id: workspace.id })}
			class={[
				'line-clamp-2 heading after:absolute after:inset-0 after:rounded-card',
				unread.has(workspace.id) && 'font-semibold'
			]}
		>
			{workspace.title}
		</a>

		<div class="relative mt-auto flex min-w-0">
			<WorkspaceActions
				compact
				standing={workspace.standing}
				pull={workspace.pull}
				actions={workspace.actions}
				pending={pendingPullAction.has(workspace.id)
					? workspace.actions.filter((action) => action.pullNumber).map((action) => action.id)
					: []}
				asking={workspace.outcome === 'asking'}
				onopenpull={() => open(workspace)}
				onaction={(action) => actFromAfar(workspace, action)}
			/>
		</div>
	</li>
{/snippet}
