<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import StandingIcon from '#lib/components/StandingIcon.svelte';
	import { timeAgo } from '#lib/format.ts';
	import { follow } from '#lib/live.svelte.ts';
	import { unread } from '#lib/notifications.svelte.ts';
	import { lanes, type Lane } from '#lib/overview.ts';
	import type { Navigation, Overview } from '#lib/server/views.ts';
	import Button from '#lib/ui/Button.svelte';
	import Page from '#lib/ui/Page.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Item = Overview[number];

	const live = follow<Overview>('overview');
	const nav = follow<Navigation>('navigation');
	const byLane = $derived(lanes(live.current ?? [], unread));
	const repoNames = $derived(new Map(nav.current?.repos.map((repo) => [repo.id, repo.name])));

	/** What the page says up top: how many of each, where there are any. */
	const summary = $derived(
		[
			[byLane.attention.length, 'need you'],
			[byLane.working.length, 'at work'],
			[byLane.open.length, 'open']
		]
			.filter(([count]) => count)
			.map(([count, what]) => `${count} ${what}`)
			.join(' · ')
	);

	// the times on the cards move on by themselves
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});
</script>

<Page title="Overview" wide>
	{#snippet description()}{summary || 'Nothing going on.'}{/snippet}

	{#if !live.current}
		<!-- still to come -->
	{:else if live.current.length === 0}
		<div class="empty">
			<p class="pb-4">Nothing is going on. Tell an agent what to do.</p>
			<Button variant="primary" onclick={() => goto(resolve('/'))}>New workspace</Button>
		</div>
	{:else}
		<div class="space-y-10">
			{@render lane('attention', 'Needs you', 'sm:grid-cols-2')}
			{@render lane('working', 'At work', 'sm:grid-cols-2 lg:grid-cols-3')}
			{@render lane('open', 'Open', 'sm:grid-cols-2 lg:grid-cols-3')}

			{#if byLane.done.length > 0}
				<!-- done with: only there to be archived, so it says no more than its name -->
				<section class="space-y-3">
					<h2 class="label">Done</h2>
					<ul class="flex flex-wrap gap-2">
						{#each byLane.done as workspace (workspace.id)}
							<li>
								<a
									href={resolve('/workspaces/[id]', { id: workspace.id })}
									class="item gap-2 bg-sunken/60 px-2.5 py-1"
								>
									{#if workspace.standing}<StandingIcon standing={workspace.standing} />{/if}
									<span class="max-w-64 truncate">{workspace.title}</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</div>
	{/if}
</Page>

{#snippet lane(which: Lane, heading: string, columns: string)}
	{#if byLane[which].length > 0}
		<section class="space-y-3">
			<h2 class="label">{heading}</h2>
			<ul class={['grid gap-3', columns]}>
				{#each byLane[which] as workspace (workspace.id)}
					<li>{@render card(workspace, which)}</li>
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

{#snippet card(workspace: Item, which: Lane)}
	{@const glimpse = workspace.glimpse}
	<a
		href={resolve('/workspaces/[id]', { id: workspace.id })}
		class="flex h-full flex-col gap-2 card p-4 card-link"
	>
		<!-- where it is, and when anything last happened there -->
		<span class="flex items-center gap-2 text-xs text-muted">
			<span class="scale-80"><RepoIcon id={workspace.repoId} /></span>
			<span class="truncate">{repoNames.get(workspace.repoId)}</span>
			<span class="ml-auto shrink-0 tabular-nums">{timeAgo(workspace.updatedAt, now)}</span>
		</span>

		<span class={['line-clamp-2 heading', unread.has(workspace.id) && 'font-semibold']}>
			{workspace.title}
		</span>

		<!-- what there is to know from the conversation: what it asks, what went wrong, what it said -->
		{#if glimpse?.asks}
			<span class="flex gap-2 text-sm text-ink">
				<span class="mt-1 icon-[lucide--message-circle-question] size-4 shrink-0 text-accent-ink"
				></span>
				<span class="line-clamp-3">{glimpse.asks}</span>
			</span>
		{:else if glimpse?.error && which !== 'working'}
			<span class="line-clamp-3 text-sm text-danger">{glimpse.error}</span>
		{:else if glimpse?.said}
			<span class={['text-sm text-muted', which === 'open' ? 'line-clamp-2' : 'line-clamp-3']}>
				{glimpse.said}
			</span>
		{/if}

		{#if which === 'working'}
			<!-- what it does this moment -->
			<span class="mt-auto flex min-w-0 items-center gap-2 pt-1 text-xs text-muted">
				<Spinner />
				{#if glimpse?.doing}
					<span class={['size-3.5 shrink-0', glimpse.doing.icon]}></span>
					<span class="truncate font-mono">{glimpse.doing.text}</span>
				{:else}
					<span>Thinking</span>
				{/if}
			</span>
		{:else if workspace.standing || workspace.changes || workspace.pull}
			<!-- how its work stands -->
			<span class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted">
				{#if workspace.standing}
					<span class="flex items-center gap-1.5">
						<StandingIcon standing={workspace.standing} />
						{workspace.standing.label}
					</span>
				{/if}
				{#if workspace.pull}<span class="tabular-nums">#{workspace.pull.number}</span>{/if}
				{#if workspace.changes}
					<span class="tabular-nums">
						<span class="text-ok">+{workspace.changes.added}</span>
						<span class="text-danger">−{workspace.changes.removed}</span>
						in {workspace.changes.files}
						{workspace.changes.files === 1 ? 'file' : 'files'}
					</span>
				{/if}
			</span>
		{/if}
	</a>
{/snippet}
