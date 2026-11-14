<script lang="ts">
	import { resolve } from '$app/paths';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { open, singleGroup, tabsOf, type Layout } from '#lib/layout.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import Panes from '#lib/ui/Panes.svelte';
	import Split from '#lib/ui/Split.svelte';
	import { getRepo } from '../../../routes/repos.remote';
	import { getWorkspace } from '../../../routes/workspaces.remote';
	import Changes from './Changes.svelte';
	import Conversation from './Conversation.svelte';
	import DiffWindow from './DiffWindow.svelte';
	import Terminals from './Terminals.svelte';

	let { id }: { id: string } = $props();

	const query = $derived(getWorkspace(id));
	const workspace = $derived(await query);
	const repo = $derived(await getRepo(workspace.repoId));
	const running = $derived(workspace.status === 'running');

	// Windows are tabs named after what they show: the conversation, or `diff:<path>`.
	const CHAT = 'chat';
	const pathOf = (tab: string) => (tab.startsWith('diff:') ? tab.slice(5) : undefined);

	// The layout lives in this browser. The conversation is always part of it.
	// (`id` never changes: the page creates a new view per workspace.)
	// svelte-ignore state_referenced_locally
	const custom = persisted<Layout | null>(`geordi:layout:${id}`, null);
	const layout = $derived.by(() => {
		const stored = custom.current;
		if (!stored) return singleGroup([CHAT]);
		const known = tabsOf(stored).every((tab) => tab === CHAT || pathOf(tab));
		return known && tabsOf(stored).includes(CHAT) ? stored : singleGroup([CHAT]);
	});

	const sidebar = persisted('geordi:sidebar', { width: 0.3, changes: 0.45 });
</script>

<svelte:head><title>{workspace.title} · Geordi</title></svelte:head>

{#snippet tab(tab: string)}
	{@const path = pathOf(tab)}
	{#if path}
		<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
		<span class="truncate code-dense" title={path}>{path.split('/').at(-1)}</span>
	{:else}
		<AgentAvatar agent={workspace.agent} size="sm" />
		<span class="truncate">Conversation</span>
		{#if running}<span class="dot dot-live" title="Working"></span>{/if}
	{/if}
{/snippet}

{#snippet window(tab: string)}
	{@const path = pathOf(tab)}
	{#if path}
		<DiffWindow workspaceId={id} {path} />
	{:else}
		<Conversation {workspace} />
	{/if}
{/snippet}

<main class="flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col overflow-hidden md:h-dvh">
	<header class="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
		<div class="min-w-0 flex-1">
			<h1 class="truncate heading" title={workspace.title}>
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
						title={workspace.worktreeId === workspace.id
							? `Started by the agent in "${workspace.parent.title}"`
							: `Started by the agent in "${workspace.parent.title}", and working in its directory`}
					>
						<span class="icon-[lucide--corner-down-right] size-3.5 shrink-0"></span>
						<span class="truncate">{workspace.parent.title}</span>
					</a>
				{/if}
				{#if workspace.worktree}
					<span class="flex min-w-0 items-center gap-1" title={workspace.worktree.path}>
						<span class="icon-[lucide--git-branch] size-3.5 shrink-0"></span>
						<span class="truncate code-dense">{workspace.worktree.branch}</span>
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
				closable={(tab) => tab !== CHAT}
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
							revision={workspace.filesRevision}
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
