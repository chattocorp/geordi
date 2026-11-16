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
	import { JOB_TERMINAL, startOrder, type Job } from '@geordi/protocol';
	import { openMenu, type MenuItem } from '#lib/ui/menu.svelte.ts';
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
		continueWorkspace,
		getWorkspace,
		approveRun,
		openLink,
		restoreWorktree,
		say,
		startJobs,
		stopJob
	} from '../../../routes/workspaces.remote';
	import { archive as archiveWorkspace, archiveProblems, beingArchived } from './archive.svelte.ts';
	import Changes from './Changes.svelte';
	import Changeset from './Changeset.svelte';
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
	const frame = persisted<{
		side: number;
		changes: number;
		open: boolean;
		/** Which of the tabs about the workspace's work is in front. */
		tab?: 'changes' | 'release';
	}>('geordi:frame', { side: 0.3, changes: 0.45, open: true });
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

	// The repository's jobs (FDR-006): each runs in a terminal of its own, named after it.
	// Starting a job is starting that terminal (after the jobs it needs); stopping it,
	// closing it (and the jobs that need it).
	const config = $derived(workspace.archivedAt ? null : (workspace.git?.config ?? null));
	const jobs = $derived(config?.jobs ?? []);
	const links = $derived(config?.urls ?? []);
	const jobOf = (terminal?: string) =>
		terminal?.startsWith(JOB_TERMINAL) ? terminal.slice(JOB_TERMINAL.length) : undefined;
	const jobTab = (job: string) => `terminal:${JOB_TERMINAL}${job}`;
	const isUp = (job: string) => workspace.terminals.includes(JOB_TERMINAL + job);

	// The commands are in a file the agent can write, and run as the user, outside any
	// sandbox the agent is in. So they are shown, and agreed to, before they first run: once
	// per command and repository. The daemon keeps what was agreed to, and runs nothing else.
	type Seen = Record<string, string>;
	let asking = $state<{ jobs: Job[]; then: () => void } | null>(null);

	/**
	 * Does `then` once the person has agreed to every command that starting `names` would
	 * run. `then` gets the commands as they stood when asked: what was seen is what runs.
	 */
	function agreed(names: string[], then: (seen: Seen) => void) {
		const seen = Object.fromEntries(jobs.map((job) => [job.name, job.command]));
		const needed = startOrder(jobs, names).flatMap(
			(name) => jobs.find((job) => job.name === name) ?? []
		);
		const unseen = needed.filter((job) => !job.approved);
		if (unseen.length === 0) return then(seen);
		asking = { jobs: unseen, then: () => then(seen) };
	}

	async function agree() {
		if (!asking) return;
		const { jobs: unseen, then } = asking;
		asking = null;
		mergeProblem = null;
		try {
			await approveRun({ workspaceId: id, commands: unseen.map((job) => job.command) });
		} catch (error) {
			return void (mergeProblem = problemOf(error, 'Could not run that'));
		}
		then();
	}

	/** The jobs that were asked for and are on their way up. */
	const launching = new SvelteSet<string>();

	/** Starts jobs (and what they need), and brings the last of them to the front of the dock. */
	function start(names: string[]) {
		agreed(names, async (seen) => {
			const order = startOrder(jobs, names);
			for (const name of order) launching.add(name);
			if (!frame.current.open) toggleSide();
			mergeProblem = null;
			try {
				await startJobs({ workspaceId: id, jobs: names, seen });
				// its tab is there as soon as its terminal is: in front, unless it was put elsewhere
				const front = jobTab(names.at(-1)!);
				if (!tabsOf(main).includes(front)) arrange({ dock: open(dock, front) });
			} catch (error) {
				mergeProblem = problemOf(error, 'Could not start that');
			} finally {
				for (const name of order) launching.delete(name);
			}
		});
	}

	const stop = (job: string) => stopJob({ workspaceId: id, job }).catch(() => {});

	/** Opens a link in the browser, once the jobs it needs are up. */
	function visit(link: (typeof links)[number]) {
		agreed(link.needs, async (seen) => {
			// a new tab has to be opened while the click still counts; where to comes later
			// (`window` is the name of a snippet in here)
			const tab = globalThis.open('about:blank', '_blank');
			mergeProblem = null;
			try {
				const href = await openLink({ workspaceId: id, link: link.name, seen });
				if (!tab) return void globalThis.open(href, '_blank', 'noopener');
				tab.opener = null; // what is served there has no business with this page
				tab.location.href = href;
			} catch (error) {
				tab?.close();
				mergeProblem = problemOf(error, 'Could not open that');
			}
		});
	}

	/** What the Run button offers where there is more than one thing to run. */
	const jobMenu = (): MenuItem[] => [
		...jobs.map(({ name }): MenuItem =>
			isUp(name)
				? { label: `Stop ${name}`, icon: 'icon-[lucide--square]', onselect: () => stop(name) }
				: { label: `Start ${name}`, icon: 'icon-[lucide--play]', onselect: () => start([name]) }
		),
		'separator',
		{
			label: 'Start all',
			icon: 'icon-[lucide--list-video]',
			disabled: jobs.every((job) => isUp(job.name)),
			onselect: () => start(jobs.map((job) => job.name))
		},
		{
			label: 'Stop all',
			icon: 'icon-[lucide--circle-stop]',
			disabled: !jobs.some((job) => isUp(job.name)),
			onselect: () => jobs.filter((job) => isUp(job.name)).forEach((job) => stop(job.name))
		}
	];
	const linkMenu = (): MenuItem[] =>
		links.map((link) => ({
			label: `${link.name}  ${link.href.replace(/^https?:\/\//, '')}`,
			icon: 'icon-[lucide--arrow-up-right]',
			onselect: () => visit(link)
		}));

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
				const job = jobOf(terminal);
				// a job takes the jobs that need it along
				if (job) stop(job);
				else closeTerminal({ workspaceId: id, terminal }).catch(() => {});
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

	/** Opens a file's diff, next to the conversation. */
	const openDiff = (path: string) => arrange({ main: open(main, `diff:${path}`, chatGroup) });

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
				action.prompt
					? asked.includes(action.prompt)
					: (action.id === 'merge-pull' && merging) ||
						(action.id === 'archive' && leaving) ||
						(action.id === 'continue' && continuing)
			)
			.map((a) => a.id);
	});

	/** Why archiving didn't work, if it didn't. */
	const archiveProblem = $derived(archiveProblems[id]);

	/** It is being archived right now, which takes a moment. */
	const leaving = $derived(beingArchived.has(id));

	async function archive() {
		// How it stands is on screen already: the question, if there is one, needs no waiting.
		// (Not with workspaces its agent started: theirs is not known here.)
		const known =
			workspace.children.length === 0 && git?.changes
				? { changes: git.changes, upstream: git.upstream }
				: undefined;
		if (await archiveWorkspace(id, known))
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

	/** The workspace is being moved to a new branch right now, to carry on with new work. */
	let continuing = $state(false);

	async function carryOn() {
		mergeProblem = null;
		continuing = true;
		try {
			await continueWorkspace(id);
		} catch (error) {
			mergeProblem = problemOf(error, 'Could not continue the workspace');
		} finally {
			continuing = false;
		}
	}

	function act(action: WorkspaceAction) {
		if (action.prompt) say({ workspaceId: id, text: action.prompt });
		else if (action.id === 'merge-pull') merge();
		else if (action.id === 'restore-worktree') restore();
		else if (action.id === 'continue') carryOn();
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

<!-- The repository's jobs and links (FDR-006), where what they start shows up: the dock. -->
{#snippet runActions()}
	{#if jobs.length === 1 && links.length === 0}
		<!-- one thing to run: a button says it all -->
		{@const [job] = jobs}
		{#if isUp(job.name) || launching.has(job.name)}
			<Button
				variant="ghost"
				size="sm"
				icon="icon-[lucide--square]"
				label="Stop {job.name}"
				onclick={() => stop(job.name)}
			>
				Stop
			</Button>
		{:else}
			<Button
				variant="ghost"
				size="sm"
				icon="icon-[lucide--play]"
				label="Run: {job.command}"
				onclick={() => start([job.name])}
			>
				Run
			</Button>
		{/if}
	{:else if jobs.length > 0 || links.length > 0}
		{#if jobs.length > 0}
			<Button
				variant="ghost"
				size="sm"
				icon="icon-[lucide--play]"
				label="Start and stop what the project runs"
				aria-haspopup="menu"
				onclick={(event) => openMenu(event.currentTarget, jobMenu())}
			>
				Run
				{#if jobs.some((job) => isUp(job.name))}<span class="dot dot-live"></span>{/if}
				<span class="icon-[lucide--chevron-down] size-3.5"></span>
			</Button>
		{/if}
		{#if links.length > 0}
			<Button
				variant="ghost"
				size="sm"
				icon="icon-[lucide--globe]"
				label="Open what the project serves, in the browser"
				aria-haspopup="menu"
				onclick={(event) => openMenu(event.currentTarget, linkMenu())}
			>
				Open
				<span class="icon-[lucide--chevron-down] size-3.5"></span>
			</Button>
		{/if}
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

{#snippet sideTab(id: 'changes' | 'release', label: string, count: number, live: boolean)}
	{@const active = (git?.release ? (frame.current.tab ?? 'changes') : 'changes') === id}
	<button
		type="button"
		role="tab"
		aria-selected={active}
		onclick={() => (frame.current = { ...frame.current, tab: id })}
		class={['item h-7 gap-2 px-2.5', active && 'item-active font-medium']}
	>
		{label}
		{#if count > 0}<Badge tone={live ? 'accent' : 'neutral'}>{count}</Badge>{/if}
	</button>
{/snippet}

{#snippet tab(tab: string)}
	{@const path = pathOf(tab)}
	{#if path}
		<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
		<span class="truncate code-dense" title={path}>{path.split('/').at(-1)}</span>
	{:else if terminalOf(tab)}
		{@const job = jobOf(terminalOf(tab))}
		{#if job}
			<span class="icon-[lucide--play] size-3.5 shrink-0"></span>
			<span class="truncate">{job}</span>
		{:else}
			{@const terminals = [...tabsOf(main), ...tabsOf(dock)]
				.filter((other) => terminalOf(other) && !jobOf(terminalOf(other)))
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
		<Terminal workspaceId={id} {terminal} start={starting.has(terminal)} />
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
			working={running}
			checking={!workspace.archivedAt && !!workspace.worktree && (!git || git.checking)}
			onaction={act}
		/>
		{#if workspace.archivedAt}
			<Badge>Archived</Badge>
		{:else}
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
			{#if leaving}
				<Badge><Spinner label="Archiving" /> Archiving…</Badge>
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
			<div class="min-w-0 flex-1"><Notice>{archiveProblem}</Notice></div>
			<Button variant="ghost" onclick={() => delete archiveProblems[id]}>Dismiss</Button>
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
						<!-- What the workspace has done, in tabs: its changes, and what they mean for the next releases. -->
						<div role="tablist" class="pane-bar gap-1 px-2" aria-label="About the workspace's work">
							{@render sideTab('changes', 'Changes', git?.changes?.files.length ?? 0, false)}
							{#if git?.release}
								{@const notes = git.release.packages.flatMap((pkg) => pkg.notes)}
								{@render sideTab(
									'release',
									'Changeset',
									notes.filter((note) => note.added).length,
									true
								)}
							{/if}
						</div>
						{#if git?.release && frame.current.tab === 'release'}
							<Changeset plan={git.release} onopen={openDiff} />
						{:else}
							<Changes
								{git}
								gone={worktreeGone ? (workspace.worktree?.branch ?? null) : null}
								onopen={openDiff}
							/>
						{/if}
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

<!-- Before running commands nobody has agreed to yet (see `agreed`). -->
<Dialog
	bind:open={() => asking !== null, (open) => !open && (asking = null)}
	label="Run {asking?.jobs.length === 1 ? 'this command' : 'these commands'}?"
	class="max-w-lg"
>
	<div class="space-y-4 p-6">
		<p class="heading">Run {asking?.jobs.length === 1 ? 'this command' : 'these commands'}?</p>
		<ul class="space-y-2">
			{#each asking?.jobs ?? [] as job (job.name)}
				<li class="space-y-1">
					{#if (asking?.jobs.length ?? 0) > 1 || job.name !== 'run'}
						<p class="label">{job.name}</p>
					{/if}
					<pre
						class="rounded-control bg-sunken p-3 code-dense break-all whitespace-pre-wrap">{job.command}</pre>
				</li>
			{/each}
		</ul>
		<p class="text-sm text-muted">
			From the repository's <span class="code-dense">.geordi.toml</span>, a file the agent can
			change. They run in your own shell, with everything you are allowed to do. You are asked once
			per command and repository.
		</p>
		<div class="flex justify-end gap-2">
			<Button onclick={() => (asking = null)}>Cancel</Button>
			<Button variant="primary" icon="icon-[lucide--play]" onclick={agree}>Run</Button>
		</div>
	</div>
</Dialog>
