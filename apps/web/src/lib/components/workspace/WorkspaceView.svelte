<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { actionsFor, type WorkspaceAction } from '#lib/actions.ts';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { open, singleGroup, tabsOf, type Layout } from '#lib/layout.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Panes from '#lib/ui/Panes.svelte';
	import Split from '#lib/ui/Split.svelte';
	import { getRepo } from '../../../routes/repos.remote';
	import {
		archiveWorkspace,
		getChanges,
		getUpstream,
		getWorkspace,
		say
	} from '../../../routes/workspaces.remote';
	import Changes from './Changes.svelte';
	import Conversation from './Conversation.svelte';
	import DiffWindow from './DiffWindow.svelte';
	import Terminals from './Terminals.svelte';
	import WorkspaceActions from './WorkspaceActions.svelte';

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

	// What could happen next (FDR-003), from where the changes and the pull request stand.
	// These are the same queries the changes pane shows and keeps fresh.
	const changes = $derived(getChanges(id));
	const upstream = $derived(getUpstream(id));
	const actions = $derived(
		workspace.archivedAt || !changes.current || changes.current.unavailable
			? []
			: actionsFor({ changes: changes.current, upstream: upstream.current?.upstream ?? null })
	);
	// An action is under way while its message waits, or is what the agent is working on.
	const pending = $derived.by(() => {
		const asked = [...workspace.queue];
		const last = workspace.transcript.findLast((item) => item.kind === 'user');
		if (running && last?.kind === 'user') asked.push(last.text);
		return actions
			.filter((action) => action.prompt && asked.includes(action.prompt))
			.map((a) => a.id);
	});

	/** Why archiving didn't work, if it didn't: usually work that would be lost. */
	let archiveProblem = $state<string | null>(null);

	async function archive(discard = false) {
		archiveProblem = null;
		try {
			await archiveWorkspace({ workspaceId: id, discard });
			await goto(resolve('/repos/[id]', { id: workspace.repoId }));
		} catch (error) {
			archiveProblem = error instanceof Error ? error.message : 'Could not archive the workspace';
		}
	}

	function act(action: WorkspaceAction) {
		if (action.prompt) say({ workspaceId: id, text: action.prompt });
		else if (action.id === 'archive') archive();
	}
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
		<WorkspaceActions {actions} {pending} onaction={act} />
		{#if workspace.archivedAt}
			<Badge>Archived</Badge>
		{:else}
			<StatusBadge {running} />
			<!-- Always possible, not only once it is the obvious next step. -->
			{#if !actions.some((action) => action.id === 'archive')}
				<Button
					variant="ghost"
					icon="icon-[lucide--archive]"
					label="Archive workspace"
					disabled={running}
					onclick={() => archive()}
				/>
			{/if}
		{/if}
	</header>

	{#if archiveProblem}
		<div class="flex items-center gap-3 border-b border-line px-5 py-2.5">
			<div class="min-w-0 flex-1"><Notice>{archiveProblem}</Notice></div>
			<Button onclick={() => archive(true)}>Discard them and archive</Button>
			<Button variant="ghost" onclick={() => (archiveProblem = null)}>Cancel</Button>
		</div>
	{/if}

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
						<Terminals workspaceId={id} running={workspace.terminals} />
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
