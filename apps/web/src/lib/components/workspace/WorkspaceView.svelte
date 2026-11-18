<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		actionsFor,
		PUBLISHING,
		standingOf,
		type WorkspaceAction,
		type WorkspaceStanding
	} from '#lib/actions.ts';
	import { modifierKey, sidebarToggle } from '#lib/keys.ts';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		add,
		close,
		flatten,
		groupsOf,
		insert,
		move,
		open,
		prune,
		singleGroup,
		tabsOf,
		type Layout,
		type Zone
	} from '#lib/layout.ts';
	import { CONFIG_FILE, JOB_TERMINAL, startOrder, type Script } from '@geordi/protocol';
	import RunControls from './RunControls.svelte';
	import { setChangedFiles } from '#lib/changedFiles.ts';
	import { follow } from '#lib/live.svelte.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import type { Navigation, WorkspaceLive } from '#lib/server/views.ts';
	import { problemOf } from '#lib/problem.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Panes from '#lib/ui/Panes.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import Split from '#lib/ui/Split.svelte';
	import TitleBar from '#lib/ui/TitleBar.svelte';
	import {
		mergePull,
		archiveWorkspace as archiveAgent,
		closeTerminal,
		continueWorkspace,
		approveRun,
		jobsReady,
		openLink,
		restoreWorktree,
		runSetup,
		say,
		startJobs,
		stopJob,
		updateWorkspace
	} from '../../../routes/workspaces.remote';
	import { archive as archiveWorkspace, archiveProblems, beingArchived } from './archive.svelte.ts';
	import Changes from './Changes.svelte';
	import Changeset from './Changeset.svelte';
	import Conversation from './Conversation.svelte';
	import SourceWindow from './SourceWindow.svelte';
	import DiffWindow from './DiffWindow.svelte';
	import NewWorkspace from './NewWorkspace.svelte';
	import Terminal from './Terminal.svelte';
	import WorkspaceActions from './WorkspaceActions.svelte';

	type Props = {
		/** The workspace as it is now: it comes live, over the page's one connection. */
		workspace: WorkspaceLive;
		/** Whether that is up to date: not while the connection is down. */
		connected: boolean;
	};
	let { workspace, connected }: Props = $props();
	// (never another's: the page makes a new view for each workspace)
	// svelte-ignore state_referenced_locally
	const id = workspace.id;

	// its repository, as everyone knows it; by its ID until that has come
	const everything = follow<Navigation>('navigation');
	const repo = $derived(
		everything.current?.repos.find((repo) => repo.id === workspace.repoId) ?? {
			id: workspace.repoId,
			name: workspace.repoId
		}
	);
	const running = $derived(workspace.status === 'running');

	// A workspace has a fixed frame of three areas: the main one, and beside it one above
	// the other (the side, and the dock). Windows are tabs named after what they show: the
	// conversation, the workspace's `changes` and its `changeset`, `diff:<path>` and
	// `terminal:<name>`. The conversation lives in the main area; everything else can be
	// dragged from any area to any other.
	const CHAT = 'chat';
	const CHANGES = 'changes';
	const CHANGESET = 'changeset';
	/** A conversation that has not begun: there is one at most. */
	const DRAFT = 'draft';
	type Area = 'main' | 'side' | 'dock';
	const pathOf = (tab: string) => (tab.startsWith('diff:') ? tab.slice(5) : undefined);
	const sourceOf = (tab: string) => (tab.startsWith('source:') ? tab.slice(7) : undefined);
	const terminalOf = (tab: string) => (tab.startsWith('terminal:') ? tab.slice(9) : undefined);
	/** An agent working alongside this workspace's own (`agent:<its workspace's ID>`). */
	const aideOf = (tab: string) =>
		tab.startsWith('agent:') ? workspace.aides.find((aide) => aide.id === tab.slice(6)) : undefined;

	// How the windows are arranged, and the sizes of the frame, are remembered in this browser.
	// (`id` never changes: the page creates a new view per workspace.)
	const arrangement = persisted<Partial<Record<Area, Layout | null>>>(
		`geordi:arrangement:${id}`,
		{}
	);
	const frame = persisted('geordi:frame', { side: 0.28, changes: 0.45, open: true });
	const toggleSide = () => (frame.current = { ...frame.current, open: !frame.current.open });

	/** Terminals asked for just now, whose shells are still starting. */
	const starting = new SvelteSet<string>();
	$effect(() => {
		for (const name of starting) if (workspace.terminals.includes(name)) starting.delete(name);
	});

	// Which windows there are follows from the workspace, not from memory: the conversation
	// and the changes always, the changeset where the repository has one, a terminal for
	// every running shell and for no other.
	const exists = (tab: string) => {
		const terminal = terminalOf(tab);
		if (terminal) return workspace.terminals.includes(terminal) || starting.has(terminal);
		if (tab === CHANGESET) return !!workspace.git?.release;
		if (tab === DRAFT) return drafting;
		if (tab.startsWith('agent:')) return !!aideOf(tab);
		return tab === CHAT || tab === CHANGES || !!pathOf(tab) || !!sourceOf(tab);
	};
	/** The three areas' windows: as they were arranged, and what is new where it belongs. */
	const layouts = $derived.by((): Record<Area, Layout> => {
		const placed: string[] = [];
		// a window is in one place only: where it was put first, going through the areas
		const arranged = (area: Area) => {
			const layout = prune(
				arrangement.current[area] ?? singleGroup([], { id: area }),
				(tab) =>
					!placed.includes(tab) &&
					(exists(tab) || (tab === CHANGESET && (!workspace.git || workspace.git.releasePending)))
			);
			placed.push(...tabsOf(layout));
			return layout;
		};
		// only the main area is split into more: beside it, each area is one row of tabs
		let [main, side, dock]: Layout[] = [
			arranged('main'),
			flatten(arranged('side'), 'side'),
			flatten(arranged('dock'), 'dock')
		];
		// What nobody has placed yet goes where it belongs, without pushing to the front:
		// the conversation in the main area, what the workspace has done beside it, terminals
		// (opened in another browser, say) in the dock.
		if (!placed.includes(CHAT)) main = add(main, CHAT);
		// the agents working alongside: conversations too, next to the workspace's own
		const beside = groupsOf(main).find((group) => group.tabs.includes(CHAT))?.id;
		for (const aide of workspace.aides)
			if (!placed.includes(`agent:${aide.id}`)) main = add(main, `agent:${aide.id}`, beside);
		for (const tab of [CHANGES, CHANGESET])
			if (exists(tab) && !placed.includes(tab)) side = add(side, tab);
		for (const name of workspace.terminals)
			if (!placed.includes(`terminal:${name}`)) dock = add(dock, `terminal:${name}`);
		return { main, side, dock };
	});
	const main = $derived(layouts.main);
	const dock = $derived(layouts.dock);
	const everywhere = () =>
		(['main', 'side', 'dock'] as const).flatMap((area) => tabsOf(layouts[area]));
	const areaOf = (tab: string) =>
		(['main', 'side', 'dock'] as const).find((area) => tabsOf(layouts[area]).includes(tab));

	// The repository's jobs (FDR-006): each runs in a terminal of its own, named after it.
	// Starting a job is starting that terminal (after the jobs it needs); stopping it,
	// closing it (and the jobs that need it).
	const config = $derived(workspace.archivedAt ? null : (workspace.git?.config ?? null));
	const jobs = $derived(config?.jobs ?? []);
	const links = $derived(config?.urls ?? []);
	const jobOf = (terminal?: string) =>
		terminal?.startsWith(JOB_TERMINAL) ? terminal.slice(JOB_TERMINAL.length) : undefined;
	const jobTab = (job: string) => `terminal:${JOB_TERMINAL}${job}`;
	/** A job runs while its terminal is there and its command has not ended in it. */
	const isUp = (job: string) =>
		workspace.terminals.includes(JOB_TERMINAL + job) && !(JOB_TERMINAL + job in workspace.finished);

	// The commands are in a file the agent can write, and run as the user, outside any
	// sandbox the agent is in. So they are shown, and agreed to, before they first run: once
	// per command and repository. The daemon keeps what was agreed to, and runs nothing else.
	type Seen = Record<string, string>;
	type Command = Script & { name: string; label?: string };
	let asking = $state<{ jobs: Command[]; then: () => void } | null>(null);

	/**
	 * Does `then` once the person has agreed to `commands`, and to the teardown script that is
	 * to clean up after what they run (it has no moment of its own to be asked in).
	 */
	function agreedTo(commands: Command[], then: () => void) {
		const teardown: Command[] = config?.teardown ? [{ name: 'teardown', ...config.teardown }] : [];
		const unseen = [...commands, ...teardown].filter((command) => !command.approved);
		if (unseen.length === 0) return then();
		asking = { jobs: unseen, then };
	}

	/**
	 * Does `then` once the person has agreed to every command that starting `names` would
	 * run. `then` gets the commands as they stood when asked: what was seen is what runs.
	 */
	function agreed(names: string[], then: (seen: Seen) => void) {
		const seen = Object.fromEntries(jobs.map((job) => [job.name, job.command]));
		const needed = startOrder(jobs, names).flatMap(
			(name) => jobs.find((job) => job.name === name) ?? []
		);
		agreedTo(needed, () => then(seen));
	}

	/** Runs the setup script (again): it ran by itself when the worktree was made, if agreed to. */
	function setUp() {
		const setup = config?.setup;
		if (!setup) return;
		agreedTo([{ name: 'setup', ...setup }], async () => {
			if (!frame.current.open) toggleSide();
			mergeProblem = null;
			try {
				await runSetup({ workspaceId: id, command: setup.command });
				const front = jobTab('setup');
				const at = areaOf(front) ?? 'dock';
				arrange({ [at]: open(layouts[at], front) });
			} catch (error) {
				mergeProblem = problemOf(error, 'Could not set up');
			}
		});
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

	/** The jobs that were asked for and are on their way up: until they listen on their port. */
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
				const at = areaOf(front) ?? 'dock';
				arrange({ [at]: open(layouts[at], front) });
				await jobsReady({ workspaceId: id, jobs: order });
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
			const booting = startOrder(jobs, link.needs).filter((name) => !isUp(name));
			for (const name of booting) launching.add(name);
			mergeProblem = null;
			try {
				const href = await openLink({ workspaceId: id, link: link.name, seen });
				if (!tab) return void globalThis.open(href, '_blank', 'noopener');
				tab.opener = null; // what is served there has no business with this page
				tab.location.href = href;
			} catch (error) {
				tab?.close();
				mergeProblem = problemOf(error, 'Could not open that');
			} finally {
				for (const name of booting) launching.delete(name);
			}
		});
	}

	/**
	 * A setup script nobody has agreed to yet: it has not run, and the workspace says so,
	 * with the way to see it and agree. One that was agreed to runs by itself, and is
	 * nothing to speak of.
	 */
	const setupPending = $derived(!!config?.setup && !config.setup.approved);

	// Another agent in this workspace: a conversation of its own, in the same directory. It
	// begins as a window to write the first message in, and to say who it is for; the agent
	// is there once that is sent.
	let drafting = $state(false);
	function newConversation() {
		drafting = true;
		return DRAFT;
	}

	let focusTerminal = $state<string>();
	function newTerminal(focus = true) {
		// starts with the time, so that terminals sort, and are numbered, in the order they were opened
		const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}`;
		starting.add(name);
		if (focus) focusTerminal = name;
		return `terminal:${name}`;
	}

	// A workspace has a terminal to begin with: opened when it is, if it has none, where
	// there is a directory to open one in.
	let begun = false;
	$effect(() => {
		if (begun || !git?.changes || workspace.archivedAt || !workspace.worktree || worktreeGone)
			return;
		begun = true;
		untrack(() => {
			if (workspace.terminals.length === 0 && starting.size === 0)
				arrange({ dock: open(dock, newTerminal(false)) });
		});
	});

	/** Remembers a new arrangement. A terminal whose window is gone from it has its shell ended. */
	function arrange(next: Partial<Record<Area, Layout>>) {
		const after = { ...layouts, ...next };
		const remaining = Object.values(after).flatMap(tabsOf);
		if (!remaining.includes(DRAFT)) drafting = false;
		for (const tab of everywhere()) {
			const terminal = terminalOf(tab);
			const source = sourceOf(tab);
			if (source && !remaining.includes(tab)) citations.delete(source);
			const aide = aideOf(tab);
			// an agent whose conversation is closed is done here: archived, its conversation kept
			if (aide && !remaining.includes(tab))
				archiveAgent({ workspaceId: aide.id, confirmed: true }).catch(
					(error) => (mergeProblem = problemOf(error, 'Could not close the conversation'))
				);
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

	/** A window dragged from one area was dropped in another. */
	const receive =
		(to: Area) => (tab: string, groupId: string, zone: Zone, before?: string | null) => {
			const from = areaOf(tab);
			if (!from || from === to) return;
			const placed = insert(layouts[to], tab, groupId, zone, before);
			// nowhere to put it (the group is gone): leave the window where it is
			if (placed === layouts[to]) return;
			arrange({ [to]: placed, [from]: close(layouts[from], tab) });
		};
	/** The conversation stays where it is, and what a workspace always has can't be closed. */
	const movable = (tab: string) => tab !== CHAT;
	const closable = (tab: string) =>
		tab !== CHAT &&
		tab !== CHANGES &&
		tab !== CHANGESET &&
		// not from under an agent at work
		aideOf(tab)?.status !== 'running';

	/** Opens a file's diff, next to the conversation. */
	const openDiff = (path: string) => arrange({ main: open(main, `diff:${path}`, chatGroup) });

	// Its conversations link the files it has changed to their diffs. The list is compared as
	// text: the changes are new with every update, and each new set renders every reply again.
	const changedList = $derived(
		workspace.git?.changes?.files.map((file) => file.path).join('\n') ?? ''
	);
	const changedPaths = $derived(new Set(changedList.split('\n').filter(Boolean)));
	const citations = new SvelteMap<string, { line?: number }>();
	setChangedFiles({
		get paths() {
			return changedPaths;
		},
		get root() {
			return workspace.worktree?.path;
		},
		openSource(path, line) {
			const tab = `source:${path}`;
			const area = areaOf(tab) ?? 'main';
			if (area !== 'main' && !frame.current.open) toggleSide();
			citations.set(path, { line });
			arrange({ [area]: open(layouts[area], tab, chatGroup) });
		},
		open: openDiff
	});

	// A link to an agent working alongside leads here, to its conversation (`?agent=`). So
	// does beginning one: it takes the place of the window it was begun in.
	$effect(() => {
		const tab = `agent:${page.url.searchParams.get('agent')}`;
		untrack(() => {
			const at = aideOf(tab) && areaOf(tab);
			if (!at) return;
			const begun = areaOf(DRAFT);
			if (!begun) return arrange({ [at]: open(layouts[at], tab) });
			const group = groupsOf(layouts[begun]).find((group) => group.tabs.includes(DRAFT))!.id;
			arrange(
				begun === at
					? { [at]: close(move(layouts[at], tab, group, 'center', DRAFT), DRAFT) }
					: {
							[at]: close(layouts[at], tab),
							[begun]: close(insert(layouts[begun], tab, group, 'center', DRAFT), DRAFT)
						}
			);
		});
	});

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
		workspace.archivedAt || !git?.changes || git.checking
			? null
			: {
					changes: git.changes,
					upstream: git.upstream,
					failed: workspace.lastTurn === 'failed',
					child: !!workspace.parentId
				}
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
					? asked.includes(action.prompt) || (action.id === 'merge-upstream' && updating)
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
			!workspace.hasChildWorktrees && git?.changes && !git.checking
				? { changes: git.changes, upstream: git.upstream }
				: undefined;
		if (await archiveWorkspace(id, known))
			// from a workspace an agent started, back to the one whose agent started it
			await goto(
				workspace.parentId ? resolve('/workspaces/[id]', { id: workspace.parentId }) : resolve('/')
			);
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

	/** The latest of its base branch is being brought in right now, by Geordi itself. */
	let updating = $state(false);

	async function update(prompt: string) {
		mergeProblem = null;
		updating = true;
		try {
			await updateWorkspace({ workspaceId: id, prompt });
		} catch (error) {
			mergeProblem = problemOf(error, 'Could not update the branch');
		} finally {
			updating = false;
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

	/** Whether any agent is at work in the workspace: its own, or one working alongside. */
	const working = $derived(running || workspace.aides.some((aide) => aide.status === 'running'));
	/**
	 * What is offered now: not publishing while an agent is at work (`PUBLISHING`). One that
	 * was asked for already stays, to show that it is under way.
	 */
	const offered = $derived(
		actions.filter(
			(action) => !working || !PUBLISHING.includes(action.id) || pending.includes(action.id)
		)
	);

	function act(action: WorkspaceAction) {
		// Geordi's to do where git can, the agent's where it takes judgement
		if (action.id === 'merge-upstream' && action.prompt) update(action.prompt);
		else if (action.prompt) say({ workspaceId: id, text: action.prompt });
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
	<RunControls
		defaultTarget={config?.default}
		{jobs}
		{links}
		{isUp}
		{launching}
		{start}
		{stop}
		{visit}
		problem={config?.problem}
	/>
{/snippet}

<!-- A count at the end of a tab: nearer the tab's edge than text would be, being a shape itself. -->
{#snippet count(n: number)}
	<span class="-mr-1 flex"><Badge>{n}</Badge></span>
{/snippet}

{#snippet tab(tab: string)}
	{@const path = pathOf(tab) ?? sourceOf(tab)}
	{#if tab === CHANGES}
		<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
		<span class="truncate">Changes</span>
		{#if git?.changes?.files.length}{@render count(git.changes.files.length)}{/if}
	{:else if tab === CHANGESET}
		{@const added = (git?.release?.packages ?? [])
			.flatMap((pkg) => pkg.notes)
			.filter((note) => note.added).length}
		<span class="icon-[lucide--package] size-3.5 shrink-0"></span>
		<span class="truncate">Changeset</span>
		{#if added > 0}{@render count(added)}{/if}
	{:else if path}
		<span
			class={[
				'size-3.5 shrink-0',
				sourceOf(tab) ? 'icon-[lucide--file-text]' : 'icon-[lucide--file-diff]'
			]}
		></span>
		<span class="truncate code-dense" title={path}>{path.split('/').at(-1)}</span>
	{:else if terminalOf(tab)}
		{@const job = jobOf(terminalOf(tab))}
		{#if job}
			{@const status = workspace.finished[terminalOf(tab) ?? '']}
			<!-- running; or over, and how it went: its output is still there to be read -->
			{#if status === undefined && launching.has(job)}
				<!-- on its way up: until it listens on its port -->
				<span class="grid size-3.5 shrink-0 place-items-center"><Spinner label="Starting" /></span>
			{:else if status === undefined}
				<span class="icon-[lucide--play] size-3.5 shrink-0"></span>
			{:else if status === 0}
				<span class="icon-[lucide--check] size-3.5 shrink-0 text-muted" title="Ended"></span>
			{:else}
				<span
					class="icon-[lucide--x] size-3.5 shrink-0 text-danger"
					title="Ended with status {status}"
				></span>
			{/if}
			<span class="truncate">{job}</span>
		{:else}
			{@const terminals = everywhere()
				.filter((other) => terminalOf(other) && !jobOf(terminalOf(other)))
				.sort()}
			<span class="icon-[lucide--square-terminal] size-3.5 shrink-0"></span>
			<span class="truncate">Terminal {terminals.indexOf(tab) + 1}</span>
		{/if}
	{:else if tab === DRAFT}
		<span class="icon-[lucide--message-square-plus] size-3.5 shrink-0"></span>
		<span class="truncate">New conversation</span>
	{:else if aideOf(tab)}
		{@const aide = aideOf(tab)!}
		<AgentAvatar agent={aide.agent} bare />
		<span class="max-w-48 truncate" title={aide.title}>{aide.title}</span>
		{#if aide.status === 'running'}<Spinner />{/if}
	{:else}
		<!-- a tab like the others: a small mark and a name -->
		<AgentAvatar agent={workspace.agent} bare />
		<!-- that its agent works is said by the ribbon, and round the reply box -->
		<span class="truncate">Conversation</span>
	{/if}
{/snippet}

{#snippet window(tab: string)}
	{@const path = pathOf(tab)}
	{@const terminal = terminalOf(tab)}
	{@const source = sourceOf(tab)}
	{#if tab === CHANGES}
		<Changes
			{git}
			gone={worktreeGone ? (workspace.worktree?.branch ?? null) : null}
			onopen={openDiff}
		/>
	{:else if tab === CHANGESET}
		{#if git?.release}
			<Changeset
				plan={git.release}
				onopen={openDiff}
				onallow={(command) =>
					approveRun({ workspaceId: id, commands: [command] }).catch(
						(error) => (mergeProblem = problemOf(error, 'Could not note that'))
					)}
			/>
		{:else}
			<p class="flex items-center gap-2 p-5 text-sm text-muted">
				<Spinner label="Loading changeset" /> Loading changeset…
			</p>
		{/if}
	{:else if path}
		<!-- loaded again whenever the worktree's files may have changed -->
		<DiffWindow workspaceId={id} {path} version={git?.version ?? 0} />
	{:else if source}
		<SourceWindow
			workspaceId={id}
			path={source}
			citation={citations.get(source)}
			version={git?.version ?? 0}
		/>
	{:else if terminal}
		<Terminal
			workspaceId={id}
			{terminal}
			start={starting.has(terminal)}
			autofocus={focusTerminal === terminal}
			onautofocus={() => (focusTerminal = undefined)}
		/>
	{:else if tab === DRAFT}
		<!-- begun as a workspace is: say what to do, and who does it; where the reply box will be -->
		<div class="flex min-h-0 flex-1 flex-col justify-end">
			<div class="mx-auto w-full max-w-5xl px-5 pb-5">
				<NewWorkspace repos={[repo]} alongside={id} focused />
			</div>
		</div>
	{:else if aideOf(tab)}
		<!-- what its own agent said there is that one's; and so on up -->
		<Conversation
			workspace={aideOf(tab)!}
			senders={{ ...workspace.senders, [workspace.id]: workspace.title }}
		/>
	{:else}
		<Conversation {workspace} senders={workspace.senders} />
	{/if}
{/snippet}

<main class="flex h-below-bar min-w-0 flex-col overflow-hidden md:h-dvh">
	<TitleBar>
		<div class="min-w-0 flex-1">
			<h1 class="truncate heading" title={workspace.title}>
				{workspace.title}
			</h1>
			<div class="flex items-center gap-3 overflow-hidden text-xs whitespace-nowrap text-muted">
				<span class="flex shrink-0 items-center gap-1">
					<span class="icon-[lucide--folder-git-2] size-3.5"></span>
					{repo.name}
				</span>
				{#if workspace.worktree}
					<span class="flex min-w-0 items-center gap-1" title={workspace.worktree.path}>
						<span class="icon-[lucide--git-branch] size-3.5 shrink-0"></span>
						<span class="truncate code-dense">{workspace.worktree.branch}</span>
					</span>
				{/if}
				{#if !connected}
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
			actions={offered}
			{pending}
			{working}
			asking={workspace.asking || workspace.aides.some((aide) => aide.asking)}
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

	{#if archiveProblem}
		<div class="flex items-center gap-3 px-5 py-2.5">
			<div class="min-w-0 flex-1"><Notice>{archiveProblem}</Notice></div>
			<Button variant="ghost" onclick={() => delete archiveProblems[id]}>Dismiss</Button>
		</div>
	{/if}

	{#if setupPending}
		<!-- said once, quietly, until someone has looked: it is what a new workspace would run -->
		<div class="flex items-center gap-3 px-5 py-2 text-sm text-muted">
			<span class="icon-[lucide--package-check] size-4 shrink-0"></span>
			<p class="min-w-0 flex-1 truncate">
				This repository has a setup script that nobody has agreed to yet. It has not run.
			</p>
			<Button size="sm" onclick={setUp}>Review</Button>
		</div>
	{/if}

	{#if mergeProblem}
		<div class="flex items-center gap-3 px-5 py-2.5">
			<div class="min-w-0 flex-1"><Notice>{mergeProblem}</Notice></div>
			<Button variant="ghost" onclick={() => (mergeProblem = null)}>Dismiss</Button>
		</div>
	{/if}

	<!-- room for a conversation to be read in, and for file names beside their line counts -->
	<Split
		dir="row"
		bare
		min={[320, 260]}
		collapsed={!frame.current.open}
		bind:ratio={
			() => 1 - frame.current.side,
			(ratio) => (frame.current = { ...frame.current, side: 1 - ratio })
		}
	>
		{#snippet a()}
			<!-- what is read, as a sheet in the frame: as far from the window's edge as the others, -->
			<!-- and half a gap from what is beside it, where there is something -->
			<div
				class={[
					'mb-2 ml-2 flex min-h-0 flex-1 flex-col sheet',
					frame.current.open ? 'mr-1' : 'mr-2'
				]}
			>
				<Panes
					layout={main}
					onchange={(next) => arrange({ main: next })}
					{tab}
					{window}
					{closable}
					accepts={movable}
					onreceive={receive('main')}
					newTab={workspace.archivedAt ? undefined : newConversation}
					newLabel="New conversation"
				/>
			</div>
		{/snippet}
		{#snippet b()}
			{#if workspace.worktree}
				<!-- each a sheet of its own, like the conversation: their shapes are what parts them -->
				<Split
					dir="column"
					bare
					min={[120, 120]}
					bind:ratio={
						() => frame.current.changes,
						(changes) => (frame.current = { ...frame.current, changes })
					}
				>
					{#snippet a()}
						<!-- what the workspace has done: its changes, and what they mean for the next releases -->
						<div class="mr-2 mb-1 ml-1 flex min-h-0 flex-1 flex-col sheet-quiet">
							<Panes
								layout={layouts.side}
								onchange={(next) => arrange({ side: next })}
								{tab}
								{window}
								{closable}
								accepts={movable}
								onreceive={receive('side')}
								splits={false}
							/>
						</div>
					{/snippet}
					{#snippet b()}
						<div class="mt-1 mr-2 mb-2 ml-1 flex min-h-0 flex-1 flex-col sheet-quiet">
							<Panes
								layout={dock}
								onchange={(next) => arrange({ dock: next })}
								{tab}
								{window}
								{closable}
								accepts={movable}
								onreceive={receive('dock')}
								splits={false}
								newTab={workspace.archivedAt ? undefined : newTerminal}
								newLabel="New terminal"
								actions={runActions}
							/>
						</div>
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
					{#if (asking?.jobs.length ?? 0) > 1 || job.name !== 'run' || job.label}
						<p class="label">
							{job.name === 'teardown'
								? 'teardown, when the workspace is archived'
								: (job.label ?? job.name)}
						</p>
					{/if}
					<pre
						class="rounded-control bg-sunken p-3 code-dense break-all whitespace-pre-wrap">{job.command}</pre>
				</li>
			{/each}
		</ul>
		<p class="text-sm text-muted">
			From the repository's <span class="code-dense">{config?.file ?? CONFIG_FILE}</span>, a file
			the agent can change. They run in your own shell, with everything you are allowed to do. You
			are asked once per command and repository.
		</p>
		<div class="flex justify-end gap-2">
			<Button onclick={() => (asking = null)}>Cancel</Button>
			<Button variant="primary" icon="icon-[lucide--play]" onclick={agree}>Run</Button>
		</div>
	</div>
</Dialog>
