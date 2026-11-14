<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { actionsFor, type WorkspaceAction } from '#lib/actions.ts';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		add,
		groupsOf,
		open,
		prune,
		singleGroup,
		splitOf,
		tabsOf,
		type Layout
	} from '#lib/layout.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Panes from '#lib/ui/Panes.svelte';
	import { getRepo } from '../../../routes/repos.remote';
	import {
		archiveWorkspace,
		closeTerminal,
		getChanges,
		getUpstream,
		getWorkspace,
		say
	} from '../../../routes/workspaces.remote';
	import Changes from './Changes.svelte';
	import Conversation from './Conversation.svelte';
	import DiffWindow from './DiffWindow.svelte';
	import Terminal from './Terminal.svelte';
	import WorkspaceActions from './WorkspaceActions.svelte';

	let { id }: { id: string } = $props();

	const query = $derived(getWorkspace(id));
	const workspace = $derived(await query);
	const repo = $derived(await getRepo(workspace.repoId));
	const running = $derived(workspace.status === 'running');

	// Everything in a workspace is a window, and every window a tab that can be dragged
	// anywhere: the conversation, the changes, each diff (`diff:<path>`) and each terminal
	// (`terminal:<name>`).
	const CHAT = 'chat';
	const CHANGES = 'changes';
	const pathOf = (tab: string) => (tab.startsWith('diff:') ? tab.slice(5) : undefined);
	const terminalOf = (tab: string) => (tab.startsWith('terminal:') ? tab.slice(9) : undefined);

	/** The group terminals open in by default. It stays put when empty. */
	const TERMINALS = 'terminals';
	// The conversation takes the room; changes sit beside it, above the terminals.
	const initial = splitOf(
		'row',
		0.7,
		singleGroup([CHAT]),
		splitOf(
			'column',
			0.45,
			singleGroup([CHANGES]),
			singleGroup([], { id: TERMINALS, sticky: true })
		)
	);

	// How the windows are arranged is remembered in this browser.
	// (`id` never changes: the page creates a new view per workspace.)
	// svelte-ignore state_referenced_locally
	const arrangement = persisted<Layout | null>(`geordi:windows:${id}`, null);

	/** Terminals asked for just now, whose shells are still starting. */
	const starting = new SvelteSet<string>();
	$effect(() => {
		for (const name of starting) if (workspace.terminals.includes(name)) starting.delete(name);
	});

	// Which windows there are follows from the workspace, not from memory: the conversation
	// and the changes always, a terminal for every running shell and for no other.
	const layout = $derived.by(() => {
		const live = (name: string) => workspace.terminals.includes(name) || starting.has(name);
		let layout = prune(arrangement.current ?? initial, (tab) => {
			const terminal = terminalOf(tab);
			return terminal ? live(terminal) : tab === CHAT || tab === CHANGES || !!pathOf(tab);
		});
		for (const tab of [CHAT, CHANGES]) layout = add(layout, tab);
		for (const name of workspace.terminals) layout = add(layout, `terminal:${name}`, TERMINALS);
		return layout;
	});

	function newTerminal() {
		const name = crypto.randomUUID().slice(0, 8);
		starting.add(name);
		return `terminal:${name}`;
	}

	/** The group a window is in, so that related windows can open next to it. */
	const groupOf = (tab: string) => groupsOf(layout).find((group) => group.tabs.includes(tab))?.id;

	function arrange(next: Layout) {
		// closing a terminal's window ends its shell
		const remaining = tabsOf(next);
		for (const tab of tabsOf(layout)) {
			const terminal = terminalOf(tab);
			if (terminal && !remaining.includes(tab)) {
				starting.delete(terminal);
				closeTerminal({ workspaceId: id, terminal }).catch(() => {});
			}
		}
		arrangement.current = next;
	}

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
	{@const terminal = terminalOf(tab)}
	{#if path}
		<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
		<span class="truncate code-dense" title={path}>{path.split('/').at(-1)}</span>
	{:else if terminal}
		{@const terminals = tabsOf(layout).filter(terminalOf)}
		<span class="icon-[lucide--square-terminal] size-3.5 shrink-0"></span>
		<span class="truncate">Terminal {terminals.indexOf(tab) + 1}</span>
	{:else if tab === CHANGES}
		<span class="icon-[lucide--git-compare-arrows] size-3.5 shrink-0"></span>
		<span class="truncate">Changes</span>
		{#if changes.current?.files.length}<Badge>{changes.current.files.length}</Badge>{/if}
	{:else}
		<AgentAvatar agent={workspace.agent} size="sm" />
		<span class="truncate">Conversation</span>
		{#if running}<span class="dot dot-live" title="Working"></span>{/if}
	{/if}
{/snippet}

{#snippet window(tab: string)}
	{@const path = pathOf(tab)}
	{@const terminal = terminalOf(tab)}
	{#if path}
		<DiffWindow workspaceId={id} {path} />
	{:else if terminal}
		<Terminal workspaceId={id} {terminal} start={starting.has(terminal)} />
	{:else if tab === CHANGES}
		{#if workspace.worktree}
			<Changes
				workspaceId={id}
				revision={workspace.filesRevision}
				onopen={(path) => arrange(open(layout, `diff:${path}`, groupOf(CHAT)))}
			/>
		{:else}
			<p class="p-5 text-sm text-muted">Changes appear once the workspace's worktree is ready.</p>
		{/if}
	{:else}
		<Conversation {workspace} />
	{/if}
{/snippet}

{#snippet empty()}
	Open a terminal with +, or drag a window here.
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

	<Panes
		{layout}
		onchange={arrange}
		{tab}
		{window}
		{empty}
		closable={(tab) => tab !== CHAT && tab !== CHANGES}
		newTab={workspace.worktree && !workspace.archivedAt ? newTerminal : undefined}
		newLabel="New terminal"
	/>
</main>
