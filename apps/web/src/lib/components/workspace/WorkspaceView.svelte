<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		actionsFor,
		standingOf,
		type WorkspaceAction,
		type WorkspaceStanding
	} from '#lib/actions.ts';
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
	import { RUN_TERMINAL } from '@geordi/protocol';
	import { persisted } from '#lib/persisted.svelte.ts';
	import { problemOf } from '#lib/problem.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Panes from '#lib/ui/Panes.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import Split from '#lib/ui/Split.svelte';
	import TitleBar from '#lib/ui/TitleBar.svelte';
	import { getRepo } from '../../../routes/repos.remote';
	import {
		mergePull,
		closeTerminal,
		getWorkspace,
		approveRun,
		restoreWorktree,
		say
	} from '../../../routes/workspaces.remote';
	import { archive as archiveWorkspace, archiveProblems } from './archive.svelte.ts';
	import Changes from './Changes.svelte';
	import Conversation from './Conversation.svelte';
	import DiffWindow from './DiffWindow.svelte';
	import Family from './Family.svelte';
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

	// The repository's run command (FDR-006) gets a terminal of its own, which runs it
	// instead of a shell. Running it is starting that terminal; stopping it, closing it.
	const RUN_TAB = `terminal:${RUN_TERMINAL}`;
	const runCommand = $derived(workspace.archivedAt ? null : (workspace.git?.config?.run ?? null));
	const runs = $derived(workspace.terminals.includes(RUN_TERMINAL) || starting.has(RUN_TERMINAL));
	/** The run command as it stood when Run was pressed: what the terminal is started with. */
	let runWith = $state<string>();
	// The command is in a file the agent can write, and runs as the user, outside any
	// sandbox the agent is in. So it is shown, and agreed to, before it first runs: once per
	// command and repository. The daemon keeps what was agreed to, and runs nothing else.
	let asking = $state<string | null>(null);

	async function run(command = runCommand, sure = false) {
		if (!command) return;
		if (!workspace.git?.config?.runApproved && !sure) return void (asking = command);
		asking = null;
		if (sure) {
			mergeProblem = null;
			try {
				await approveRun({ workspaceId: id, command });
			} catch (error) {
				return void (mergeProblem = problemOf(error, 'Could not run the command'));
			}
		}
		runWith = command;
		starting.add(RUN_TERMINAL);
		// in the dock, in front, and with the dock in view
		const elsewhere = tabsOf(main).includes(RUN_TAB);
		if (!elsewhere) arrange({ dock: open(dock, RUN_TAB) });
		if (!frame.current.open) toggleSide();
	}
	const stopRun = () => arrange({ main: close(main, RUN_TAB), dock: close(dock, RUN_TAB) });

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
	/**
	 * The workspace had a worktree, and it is no longer there: removed outside Geordi. Not
	 * while the agent is at work, which is when it comes back.
	 */
	const worktreeGone = $derived(
		!!workspace.worktree && !!git?.missing && !running && !workspace.archivedAt
	);
	const standingState = $derived(
		workspace.archivedAt || !git?.changes ? null : { changes: git.changes, upstream: git.upstream }
	);
	// A worktree that is gone is where the workspace stands, and bringing it back the next step.
	const actions = $derived<WorkspaceAction[]>(
		worktreeGone
			? [{ id: 'restore-worktree', label: 'Restore', icon: 'icon-[lucide--rotate-ccw]' }]
			: standingState
				? actionsFor(standingState)
				: []
	);
	const standing = $derived<WorkspaceStanding | null>(
		worktreeGone
			? { label: 'Worktree removed', tone: 'neutral', icon: 'icon-[lucide--folder-x]' }
			: standingState && standingOf(standingState)
	);
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

	/** Why archiving didn't work, if it didn't: usually work that would be lost. */
	const archiveProblem = $derived(archiveProblems[id]);

	async function archive(discard = false) {
		if (await archiveWorkspace(id, discard))
			await goto(resolve('/repos/[id]', { id: workspace.repoId }));
	}

	/** The pull request is being merged right now. */
	let merging = $state(false);
	/** Why merging (or restoring the worktree) didn't work, if it didn't. */
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

	async function restore() {
		mergeProblem = null;
		try {
			await restoreWorktree(id);
		} catch (error) {
			mergeProblem = problemOf(error, 'Could not restore the worktree');
		}
	}

	function act(action: WorkspaceAction) {
		if (action.prompt) say({ workspaceId: id, text: action.prompt });
		else if (action.id === 'merge-pull') merge();
		else if (action.id === 'restore-worktree') restore();
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

<!-- The repository's run command (FDR-006), where what it starts shows up: the dock. -->
{#snippet runActions()}
	{#if runs}
		<Button
			variant="ghost"
			size="sm"
			icon="icon-[lucide--square]"
			label="Stop what the run command started"
			onclick={stopRun}
		>
			Stop
		</Button>
	{:else if runCommand}
		<Button
			variant="ghost"
			size="sm"
			icon="icon-[lucide--play]"
			label="Run: {runCommand}"
			onclick={() => run()}
		>
			Run
		</Button>
	{:else if git?.config?.problem}
		<!-- a configuration nobody can read is worth knowing about, quietly -->
		<span
			class="mr-1.5 icon-[lucide--triangle-alert] size-4 shrink-0 text-muted"
			role="img"
			aria-label={git.config.problem}
			title={git.config.problem}
		></span>
	{/if}
{/snippet}

{#snippet tab(tab: string)}
	{@const path = pathOf(tab)}
	{#if path}
		<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
		<span class="truncate code-dense" title={path}>{path.split('/').at(-1)}</span>
	{:else if terminalOf(tab)}
		{#if tab === RUN_TAB}
			<span class="icon-[lucide--play] size-3.5 shrink-0"></span>
			<span class="truncate">Run</span>
		{:else}
			{@const terminals = [...tabsOf(main), ...tabsOf(dock)]
				.filter((other) => terminalOf(other) && other !== RUN_TAB)
				.sort()}
			<span class="icon-[lucide--square-terminal] size-3.5 shrink-0"></span>
			<span class="truncate">Terminal {terminals.indexOf(tab) + 1}</span>
		{/if}
	{:else}
		<!-- a tab like the others: a small mark and a name -->
		<AgentAvatar agent={workspace.agent} bare />
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
		<Terminal
			workspaceId={id}
			{terminal}
			start={starting.has(terminal)}
			command={terminal === RUN_TERMINAL ? runWith : undefined}
		/>
	{:else}
		<Conversation {workspace} />
	{/if}
{/snippet}

<main class="flex h-below-bar min-w-0 flex-col overflow-hidden md:h-dvh">
	<TitleBar>
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
				{#if workspace.worktree}
					<span class="flex min-w-0 items-center gap-1" title={workspace.worktree.path}>
						<span class="icon-[lucide--git-branch] size-3.5 shrink-0"></span>
						<span class="truncate code-dense">{workspace.worktree.branch}</span>
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
	<Family
		parent={workspace.parent}
		sharesWorktree={workspace.worktreeId !== workspace.id}
		children={workspace.children}
	/>

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

	<!-- room for a conversation to be read in, and for file names beside their line counts -->
	<Split
		dir="row"
		min={[320, 260]}
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
					min={[120, 120]}
					bind:ratio={
						() => frame.current.changes,
						(changes) => (frame.current = { ...frame.current, changes })
					}
				>
					{#snippet a()}
						<Changes
							{git}
							gone={worktreeGone ? (workspace.worktree?.branch ?? null) : null}
							onopen={(path) => arrange({ main: open(main, `diff:${path}`, chatGroup) })}
						/>
					{/snippet}
					{#snippet b()}
						<Panes
							layout={dock}
							onchange={(next) => arrange({ dock: next })}
							{tab}
							{window}
							accepts={(tab) => tab !== CHAT}
							onreceive={receive('dock')}
							newTab={workspace.archivedAt ? undefined : newTerminal}
							newLabel="New terminal"
							actions={runActions}
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

<!-- Before running a command that only this workspace has (see `run`). -->
<Dialog
	bind:open={() => asking !== null, (open) => !open && (asking = null)}
	label="Run this command?"
	class="max-w-lg"
>
	<div class="space-y-4 p-6">
		<p class="heading">Run this command?</p>
		<pre
			class="rounded-control bg-sunken p-3 code-dense break-all whitespace-pre-wrap">{asking}</pre>
		<p class="text-sm text-muted">
			This is the run command in the repository's <span class="code-dense">.geordi.toml</span>, a
			file the agent can change. It runs in your own shell, with everything you are allowed to do.
			You are asked once per command and repository.
		</p>
		<div class="flex justify-end gap-2">
			<Button onclick={() => (asking = null)}>Cancel</Button>
			<Button variant="primary" icon="icon-[lucide--play]" onclick={() => run(asking, true)}>
				Run
			</Button>
		</div>
	</div>
</Dialog>
