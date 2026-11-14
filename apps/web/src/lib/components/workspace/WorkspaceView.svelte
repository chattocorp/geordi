<script lang="ts">
	import { resolve } from '$app/paths';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import Panes from '#lib/components/Panes.svelte';
	import Split from '#lib/components/Split.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { untrack } from 'svelte';
	import { add, open, prune, replace, singleGroup, tabsOf, type Layout } from '#lib/layout.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import { getRepo } from '../../../routes/repos.remote';
	import { getWorkspace } from '../../../routes/workspaces.remote';
	import Changes from './Changes.svelte';
	import DiffWindow from './DiffWindow.svelte';
	import NewWindow from './NewWindow.svelte';
	import SessionWindow from './SessionWindow.svelte';
	import Terminals from './Terminals.svelte';

	let { id }: { id: string } = $props();

	const query = $derived(getWorkspace(id));
	const workspace = $derived(await query);
	const repo = $derived(await getRepo(workspace.repoId));
	const running = $derived(workspace.sessions.some((session) => session.status === 'running'));

	// Windows are tabs named after what they show: `session:<id>`, `diff:<path>`, or `new`.
	const NEW = 'new';
	const sessionTab = (sessionId: string) => `session:${sessionId}`;
	const sessionOf = (tab: string) =>
		tab.startsWith('session:')
			? workspace.sessions.find((session) => sessionTab(session.id) === tab)
			: undefined;
	const pathOf = (tab: string) => (tab.startsWith('diff:') ? tab.slice(5) : undefined);

	// The layout lives in this browser. Until it is customised, every session has a tab.
	// (`id` never changes: the page creates a new view per workspace.)
	// svelte-ignore state_referenced_locally
	const custom = persisted<Layout | null>(`geordi:layout:${id}`, null);
	const layout = $derived(
		custom.current
			? prune(custom.current, (tab) => !tab.startsWith('session:') || !!sessionOf(tab))
			: singleGroup(workspace.sessions.map((session) => sessionTab(session.id)))
	);
	const closed = $derived(
		workspace.sessions.filter((session) => !tabsOf(layout).includes(sessionTab(session.id)))
	);

	// Sessions that appear while the page is open (started by an agent, or elsewhere) get a
	// tab, in the background. Sessions closed earlier stay closed.
	let known: Set<string> | null = null;
	$effect(() => {
		const ids = workspace.sessions.map((session) => session.id);
		untrack(() => {
			if (known && custom.current)
				for (const id of ids)
					if (!known.has(id)) custom.current = add(custom.current, sessionTab(id));
		});
		known = new Set(ids);
	});

	const sidebar = persisted('geordi:sidebar', { width: 0.3, changes: 0.45 });
</script>

<svelte:head><title>{workspace.title} · Geordi</title></svelte:head>

{#snippet tab(tab: string)}
	{@const session = sessionOf(tab)}
	{@const path = pathOf(tab)}
	{#if session}
		{@const parent = workspace.sessions.find((other) => other.id === session.parentSessionId)}
		<AgentAvatar agent={session.agent} size="sm" />
		{#if session.parentSessionId}
			<span
				class="icon-[lucide--corner-down-right] size-3.5 shrink-0 text-muted"
				title={parent ? `Started by "${parent.title}"` : 'Started by an agent'}
			></span>
		{/if}
		<span class="truncate">{session.title}</span>
		{#if session.status === 'running'}
			<span class="size-1.5 shrink-0 rounded-full bg-accent" title="Working"></span>
		{/if}
	{:else if path}
		<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
		<span class="truncate font-mono text-sm" title={path}>{path.split('/').at(-1)}</span>
	{:else}
		<span class="icon-[lucide--plus] size-3.5 shrink-0"></span>
		<span class="truncate">New session</span>
	{/if}
{/snippet}

{#snippet window(tab: string)}
	{@const session = sessionOf(tab)}
	{@const path = pathOf(tab)}
	{#if session}
		<SessionWindow {session} cwd={workspace.worktree?.path} />
	{:else if path}
		<DiffWindow workspaceId={id} {path} />
	{:else}
		<NewWindow
			workspaceId={id}
			{closed}
			onopen={(sessionId) => (custom.current = replace(layout, NEW, sessionTab(sessionId)))}
		/>
	{/if}
{/snippet}

<main class="flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col md:h-dvh">
	<header class="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
		<div class="min-w-0 flex-1">
			<h1 class="truncate font-semibold tracking-tight" title={workspace.title}>
				{workspace.title}
			</h1>
			<div class="flex items-center gap-3 text-xs text-muted">
				<a
					href={resolve('/repos/[id]', { id: repo.id })}
					class="flex shrink-0 items-center gap-1 hover:text-ink"
				>
					<span class="icon-[lucide--folder-git-2] size-3.5"></span>
					{repo.name}
				</a>
				{#if workspace.parent}
					<a
						href={resolve('/workspaces/[id]', { id: workspace.parent.id })}
						class="flex min-w-0 items-center gap-1 hover:text-ink"
						title="This workspace was started by an agent in {workspace.parent.title}"
					>
						<span class="icon-[lucide--corner-down-right] size-3.5 shrink-0"></span>
						<span class="truncate">{workspace.parent.title}</span>
					</a>
				{/if}
				{#if workspace.worktree}
					<span class="flex min-w-0 items-center gap-1" title={workspace.worktree.path}>
						<span class="icon-[lucide--git-branch] size-3.5 shrink-0"></span>
						<span class="truncate font-mono">{workspace.worktree.branch}</span>
					</span>
				{/if}
				{#if !query.connected}
					<span class="flex items-center gap-1 text-danger">
						<span class="icon-[lucide--unplug] size-3.5"></span>
						Reconnecting
					</span>
				{/if}
			</div>
		</div>
		<StatusBadge {running} />
	</header>

	<Split
		dir="row"
		bind:ratio={
			() => 1 - sidebar.current.width,
			(ratio) => (sidebar.current = { ...sidebar.current, width: 1 - ratio })
		}
	>
		{#snippet a()}
			<Panes
				{layout}
				onchange={(next) => (custom.current = next)}
				{tab}
				{window}
				newTab={() => NEW}
			/>
		{/snippet}
		{#snippet b()}
			{#if workspace.worktree}
				<Split
					dir="column"
					bind:ratio={
						() => sidebar.current.changes,
						(changes) => (sidebar.current = { ...sidebar.current, changes })
					}
				>
					{#snippet a()}
						<Changes
							workspaceId={id}
							onopen={(path) => (custom.current = open(layout, `diff:${path}`))}
						/>
					{/snippet}
					{#snippet b()}
						<Terminals workspaceId={id} />
					{/snippet}
				</Split>
			{:else}
				<p class="p-5 text-sm text-muted">
					Changes and the terminal appear once the workspace's worktree is ready.
				</p>
			{/if}
		{/snippet}
	</Split>
</main>
