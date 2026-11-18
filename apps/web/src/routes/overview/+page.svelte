<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import StandingIcon from '#lib/components/StandingIcon.svelte';
	import { timeAgo } from '#lib/format.ts';
	import { follow } from '#lib/live.svelte.ts';
	import { unread } from '#lib/notifications.svelte.ts';
	import { lanes, LANES, type Lane } from '#lib/overview.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import Button from '#lib/ui/Button.svelte';
	import Page from '#lib/ui/Page.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Item = Navigation['workspaces'][number];

	const nav = follow<Navigation>('navigation');
	const byLane = $derived(lanes(nav.current?.workspaces ?? [], unread));
	const repoNames = $derived(new Map(nav.current?.repos.map((repo) => [repo.id, repo.name])));
	const titles = $derived(new Map(nav.current?.workspaces.map(({ id, title }) => [id, title])));

	const headings: Record<Lane, string> = {
		attention: 'Needs you',
		working: 'Working',
		open: 'Open',
		done: 'Done'
	};

	/** What the page says up top: how many of each, where there are any. */
	const summary = $derived(
		LANES.filter((lane) => byLane[lane].length > 0)
			.map((lane) => `${byLane[lane].length} ${headings[lane].toLowerCase()}`)
			.join(' · ')
	);

	/** Why a workspace is where it is, in a few words, where its standing doesn't say. */
	function note(workspace: Item): string | null {
		if (workspace.outcome === 'asking') return 'Asks you something';
		if (workspace.working || workspace.standing) return null;
		if (workspace.outcome === 'failed') return 'Turn failed';
		if (workspace.outcome === 'stopped') return 'Stopped';
		return unread.has(workspace.id) ? 'Finished' : null;
	}

	// the times beside each workspace move on by themselves
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});
</script>

<Page title="Overview" wide>
	{#snippet description()}{summary || 'Every workspace, by what it needs.'}{/snippet}

	{#if !nav.current}
		<!-- still to come -->
	{:else if nav.current.workspaces.length === 0}
		<div class="empty">
			<p class="pb-4">Nothing is going on. Tell an agent what to do.</p>
			<Button variant="primary" onclick={() => goto(resolve('/'))}>New workspace</Button>
		</div>
	{:else}
		<div class="space-y-8">
			{#each LANES as lane (lane)}
				{#if byLane[lane].length > 0}
					<section class="space-y-2">
						<h2 class="flex items-center gap-2 px-2.5 label">
							{headings[lane]}
							<span class="font-normal tabular-nums">{byLane[lane].length}</span>
						</h2>
						<ul class="space-y-px">
							{#each byLane[lane] as workspace (workspace.id)}
								{@render row(workspace, lane)}
							{/each}
						</ul>
					</section>
				{/if}
			{/each}
		</div>
	{/if}
</Page>

{#snippet row(workspace: Item, lane: Lane)}
	{@const said = note(workspace)}
	{@const parent = workspace.parentId ? titles.get(workspace.parentId) : null}
	<li>
		<a
			href={resolve('/workspaces/[id]', { id: workspace.id })}
			class={['item items-start gap-3 px-2.5 py-2', lane === 'done' && 'opacity-70']}
		>
			<!-- what it is, or is doing: as in the sidebar -->
			<span class="grid size-5 shrink-0 place-items-center pt-0.5 text-muted/80">
				{#if workspace.outcome === 'asking'}
					<span class="icon-[lucide--message-circle-question] size-4 text-accent-ink"></span>
				{:else if workspace.working}
					<Spinner />
				{:else if workspace.parentId}
					<span class="icon-[lucide--corner-down-right] size-4"></span>
				{:else}
					<span class="icon-[lucide--git-branch] size-4"></span>
				{/if}
			</span>

			<span class="min-w-0 flex-1">
				<span
					class={[
						'block truncate text-base text-ink',
						unread.has(workspace.id) ? 'font-semibold' : 'font-medium'
					]}
				>
					{workspace.title}
				</span>
				<span class="flex min-w-0 items-center gap-1.5 text-xs">
					<span class="scale-80"><RepoIcon id={workspace.repoId} /></span>
					<span class="shrink-0">{repoNames.get(workspace.repoId)}</span>
					{#if workspace.branch}
						<span class="truncate font-mono text-muted/80">{workspace.branch}</span>
					{/if}
					{#if parent}
						<span class="truncate text-muted/80">· started by “{parent}”</span>
					{/if}
				</span>
			</span>

			<span class="flex shrink-0 items-center gap-2 pt-0.5 text-xs">
				{#if said}
					<span class={workspace.outcome === 'asking' ? 'text-accent-ink' : 'text-ink'}>{said}</span
					>
				{:else if workspace.standing}
					<span class="hidden sm:inline">{workspace.standing.label}</span>
					<StandingIcon standing={workspace.standing} />
				{/if}
				<span class="w-16 text-right text-muted/80 tabular-nums">
					{timeAgo(workspace.updatedAt, now)}
				</span>
			</span>
		</a>
	</li>
{/snippet}
