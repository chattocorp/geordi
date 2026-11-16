<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { actionsFor, standingOf, type WorkspaceAction } from '#lib/actions.ts';
	import { modifierKey, sidebarToggle } from '#lib/keys.ts';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		add,
		close,
		groupsOf,
		insert,
		open,
		prune,
		singleGroup,
		tabsOf,
		type Layout,
		type Zone
	} from '#lib/layout.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import { problemOf } from '#lib/problem.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Panes from '#lib/ui/Panes.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import Split from '#lib/ui/Split.svelte';
	import TitleBar from '#lib/ui/TitleBar.svelte';
	import { getRepo } from '../../../routes/repos.remote';
	import { mergePull, closeTerminal, getWorkspace, say } from '../../../routes/workspaces.remote';
	import { archive as archiveWorkspace, archiveProblems } from './archive.svelte.ts';
	import Changes from './Changes.svelte';
	import Conversation from './Conversation.svelte';
	import DiffWindow from './DiffWindow.svelte';
	import { effortName } from './HarnessPicker.svelte';
	import Terminal from './Terminal.svelte';
	import WorkspaceActions from './WorkspaceActions.svelte';

	let { id }: { id: string } = $props();

	const query = $derived(getWorkspace(id));
	const workspace = $derived(await query);
	const repo = $derived(await getRepo(workspace.repoId));
	const running = $derived(workspace.status === 'running');

	// A workspace has a fixed frame: the main area, and beside it the changes above the
	// dock. Windows are tabs named after what they show: the conversation, `diff:<path>`
	// and `terminal:<name>`. The conversation lives in the main area; diffs and terminals
	// can be dragged between the main area and the dock.
	const CHAT = 'chat';
	const pathOf = (tab: string) => (tab.startsWith('diff:') ? tab.slice(5) : undefined);
	const terminalOf = (tab: string) => (tab.startsWith('terminal:') ? tab.slice(9) : undefined);

	// How the windows are arranged, and the sizes of the frame, are remembered in this browser.
	// (`id` never changes: the page creates a new view per workspace.)
	// svelte-ignore state_referenced_locally
	const arrangement = persisted<{ main: Layout | null; dock: Layout | null }>(
		`geordi:arrangement:${id}`,
		{ main: null, dock: null }
	);
	const frame = persisted('geordi:frame', { side: 0.3, changes: 0.45, open: true });
	const toggleSide = () => (frame.current = { ...frame.current, open: !frame.current.open });

	/** The workspace's ID was just copied: say so for a moment. */
	let copied = $state(false);
	async function copyId() {
		await navigator.clipboard.writeText(id);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	/** Terminals asked for just now, whose shells are still starting. */
	const starting = new SvelteSet<string>();
	$effect(() => {
		for (const name of starting) if (workspace.terminals.includes(name)) starting.delete(name);
	});

	// Which windows there are follows from the workspace, not from memory: the conversation
	// always, a terminal for every running shell and for no other.
	const exists = (tab: string) => {
		const terminal = terminalOf(tab);
		if (terminal) return workspace.terminals.includes(terminal) || starting.has(terminal);
		return tab === CHAT || !!pathOf(tab);
	};
	const main = $derived(
		add(prune(arrangement.current.main ?? singleGroup([CHAT], { id: 'main' }), exists), CHAT)
	);
	const dock = $derived.by(() => {
		const elsewhere = tabsOf(main);
		const kept = (tab: string) => exists(tab) && tab !== CHAT && !elsewhere.includes(tab);
		// terminals nobody has placed yet (opened in another browser, say) belong in the dock
		return workspace.terminals
			.map((name) => `terminal:${name}`)
			.filter((tab) => !elsewhere.includes(tab))
			.reduce(
				(layout, tab) => add(layout, tab),
				prune(arrangement.current.dock ?? singleGroup([], { id: 'dock' }), kept)
			);
	});

	function newTerminal() {
		// starts with the time, so that terminals sort, and are numbered, in the order they were opened
		const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}`;
		starting.add(name);
		return `terminal:${name}`;
	}

	/** Remembers a new arrangement. A terminal whose window is gone from it has its shell ended. */
	function arrange(next: { main?: Layout; dock?: Layout }) {
		const after = { main, dock, ...next };
		const remaining = [...tabsOf(after.main), ...tabsOf(after.dock)];
		for (const tab of [...tabsOf(main), ...tabsOf(dock)]) {
			const terminal = terminalOf(tab);
			if (terminal && !remaining.includes(tab)) {
				starting.delete(terminal);
				closeTerminal({ workspaceId: id, terminal }).catch(() => {});
			}
		}
		arrangement.current = after;
	}

	/** A window dragged from one area was dropped in the other. */
	const receive = (to: 'main' | 'dock') => (tab: string, groupId: string, zone: Zone) => {
		const [target, source] = to === 'main' ? [main, dock] : [dock, main];
		const placed = insert(target, tab, groupId, zone);
		// nowhere to put it (the group is gone): leave the window where it is
		if (placed === target) return;
		const left = close(source, tab);
		arrange(to === 'main' ? { main: placed, dock: left } : { dock: placed, main: left });
	};

	/** The group the conversation is in: where diffs open. */
	const chatGroup = $derived(groupsOf(main).find((group) => group.tabs.includes(CHAT))?.id);

	// What could happen next (FDR-003), from where the changes and the pull request stand.
	const git = $derived(workspace.git);
	const standingState = $derived(
		workspace.archivedAt || !git?.changes ? null : { changes: git.changes, upstream: git.upstream }
	);
	const actions = $derived(standingState ? actionsFor(standingState) : []);
	const standing = $derived(standingState && standingOf(standingState));
	// An action is under way while its message waits, or is what the agent is working on.
	const pending = $derived.by(() => {
		const asked = [...workspace.queue];
		const last = workspace.transcript.findLast((item) => item.kind === 'user');
		if (running && last?.kind === 'user') asked.push(last.text);
		return actions
			.filter((action) =>
				action.prompt ? asked.includes(action.prompt) : action.id === 'merge-pull' && merging
			)
			.map((a) => a.id);
	});

	/** The model and effort chosen for the agent, if any were. */
	const settings = $derived(
		[workspace.settings.model, workspace.settings.effort && effortName(workspace.settings.effort)]
			.filter(Boolean)
			.join(' · ')
	);

	/** Why archiving didn't work, if it didn't: usually work that would be lost. */
	const archiveProblem = $derived(archiveProblems[id]);

	async function archive(discard = false) {
		if (await archiveWorkspace(id, discard))
			await goto(resolve('/repos/[id]', { id: workspace.repoId }));
	}

	/** The pull request is being merged right now. */
	let merging = $state(false);
	/** Why merging didn't work, if it didn't. */
	let mergeProblem = $state<string | null>(null);

	async function merge() {
		mergeProblem = null;
		merging = true;
		try {
			await mergePull(id);
		} catch (error) {
			mergeProblem = problemOf(error, 'Could not merge the pull request');
		} finally {
			merging = false;
		}
	}

	function act(action: WorkspaceAction) {
		if (action.prompt) say({ workspaceId: id, text: action.prompt });
		else if (action.id === 'merge-pull') merge();
		else if (action.id === 'archive') archive();
	}
</script>

<svelte:head><title>{workspace.title} · Geordi</title></svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (sidebarToggle(event) !== 'right') return;
		event.preventDefault();
		toggleSide();
	}}
/>

{#snippet tab(tab: string)}
	{@const path = pathOf(tab)}
	{#if path}
		<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
		<span class="truncate code-dense" title={path}>{path.split('/').at(-1)}</span>
	{:else if terminalOf(tab)}
		{@const terminals = [...tabsOf(main), ...tabsOf(dock)].filter(terminalOf).sort()}
		<span class="icon-[lucide--square-terminal] size-3.5 shrink-0"></span>
		<span class="truncate">Terminal {terminals.indexOf(tab) + 1}</span>
	{:else}
		<AgentAvatar agent={workspace.agent} size="sm" />
		<span class="truncate">Conversation</span>
		{#if running}<Spinner />{/if}
	{/if}
{/snippet}

{#snippet window(tab: string)}
	{@const path = pathOf(tab)}
	{@const terminal = terminalOf(tab)}
	{#if path}
		<!-- loaded again whenever the worktree's files may have changed -->
		<DiffWindow workspaceId={id} {path} version={git?.version ?? 0} />
	{:else if terminal}
		<Terminal workspaceId={id} {terminal} start={starting.has(terminal)} />
	{:else}
		<Conversation {workspace} />
	{/if}
{/snippet}

{#snippet empty()}
	Open a terminal with +, or drag a window here.
{/snippet}

<main class="flex h-below-bar min-w-0 flex-col overflow-hidden md:h-dvh">
	<TitleBar class="border-b border-line">
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
				{#if settings}
					<span class="flex shrink-0 items-center gap-1" title="The model and reasoning effort">
						<span class="icon-[lucide--cpu] size-3.5"></span>
						{settings}
					</span>
				{/if}
				<!-- For telling someone (or an agent) exactly which workspace this is. -->
				<button
					type="button"
					onclick={copyId}
					class="flex shrink-0 items-center gap-1 hover:text-ink"
					title="Copy this workspace's ID: {id}"
				>
					<span class={['size-3.5', copied ? 'icon-[lucide--check]' : 'icon-[lucide--hash]']}
					></span>
					<span class="code-dense">{id.slice(0, 8)}</span>
				</button>
				{#if !query.connected}
					<span class="flex items-center gap-1 text-danger">
						<span class="icon-[lucide--unplug] size-3.5"></span>
						Reconnecting
					</span>
				{/if}
			</div>
		</div>
		<WorkspaceActions
			{standing}
			pull={standingState?.upstream?.pull}
			{actions}
			{pending}
			onaction={act}
		/>
		{#if workspace.archivedAt}
			<Badge>Archived</Badge>
		{:else}
			<StatusBadge {running} />
			<Button
				variant="ghost"
				icon={frame.current.open
					? 'icon-[lucide--panel-right-close]'
					: 'icon-[lucide--panel-right-open]'}
				label="Toggle changes and terminals ({modifierKey()}{modifierKey() === '⌘'
					? '⌥'
					: 'Alt+'}B)"
				onclick={toggleSide}
			/>
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
	</TitleBar>

	{#if archiveProblem}
		<div class="flex items-center gap-3 border-b border-line px-5 py-2.5">
			<div class="min-w-0 flex-1"><Notice>{archiveProblem.message}</Notice></div>
			{#if archiveProblem.discardable}
				<Button onclick={() => archive(true)}>Discard them and archive</Button>
			{/if}
			<Button variant="ghost" onclick={() => delete archiveProblems[id]}>Cancel</Button>
		</div>
	{/if}

	{#if mergeProblem}
		<div class="flex items-center gap-3 border-b border-line px-5 py-2.5">
			<div class="min-w-0 flex-1"><Notice>{mergeProblem}</Notice></div>
			<Button variant="ghost" onclick={() => (mergeProblem = null)}>Dismiss</Button>
		</div>
	{/if}

	<Split
		dir="row"
		collapsed={!frame.current.open}
		bind:ratio={
			() => 1 - frame.current.side,
			(ratio) => (frame.current = { ...frame.current, side: 1 - ratio })
		}
	>
		{#snippet a()}
			<Panes
				layout={main}
				onchange={(next) => arrange({ main: next })}
				{tab}
				{window}
				closable={(tab) => tab !== CHAT}
				accepts={() => true}
				onreceive={receive('main')}
			/>
		{/snippet}
		{#snippet b()}
			{#if workspace.worktree}
				<Split
					dir="column"
					bind:ratio={
						() => frame.current.changes,
						(changes) => (frame.current = { ...frame.current, changes })
					}
				>
					{#snippet a()}
						<Changes
							{git}
							onopen={(path) => arrange({ main: open(main, `diff:${path}`, chatGroup) })}
						/>
					{/snippet}
					{#snippet b()}
						<Panes
							layout={dock}
							onchange={(next) => arrange({ dock: next })}
							{tab}
							{window}
							{empty}
							accepts={(tab) => tab !== CHAT}
							onreceive={receive('dock')}
							newTab={workspace.archivedAt ? undefined : newTerminal}
							newLabel="New terminal"
						/>
					{/snippet}
				</Split>
			{:else}
				<p class="p-5 text-sm text-muted">
					Changes and terminals appear once the workspace's worktree is ready.
				</p>
			{/if}
		{/snippet}
	</Split>
</main>
