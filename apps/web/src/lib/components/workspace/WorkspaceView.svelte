<script lang="ts">
	import { restoreDiff, type Area, type Arrangement } from './diff-tabs.ts';
	import { archiveAndNavigate } from './afar.svelte.ts';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		actionsFor,
		PUBLISHING,
		standingOf,
		type WorkspaceAction,
		type WorkspaceStanding
	} from '@geordi/ui/actions';
	import { hint, pressed } from '@geordi/ui/keys';
	import WorkspaceHeading from './WorkspaceHeading.svelte';
	import MessageView from './MessageView.svelte';
	import { subagentBlocks, type TurnChanges } from '#lib/transcript.ts';
	import type { SubagentItem, Workspace } from '#lib/server/workspaces.ts';
	import { agentName } from '#lib/format.ts';
	import ConversationTab from './ConversationTab.svelte';
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
	import {
		CONFIG_FILE,
		JOB_TERMINAL,
		SCRIPTS,
		startOrder,
		type PortConflict,
		type Script
	} from '@geordi/protocol';
	import JobMark, { type JobState } from '@geordi/ui/JobMark.svelte';
	import RunPane from '@geordi/ui/RunPane.svelte';
	import RunTab from '@geordi/ui/RunTab.svelte';
	import { setChangedFiles } from '#lib/changedFiles.ts';
	import { follow } from '#lib/live.svelte.ts';
	import { getRibbonPosition } from '#lib/components/settings.svelte.ts';
	import { persisted } from '@geordi/ui/persisted';
	import type { Navigation, WorkspaceLive } from '#lib/server/views.ts';
	import { problemOf } from '#lib/problem.ts';
	import Badge from '@geordi/ui/Badge.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import PortConflictDialog from './PortConflictDialog.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import CommandPalette from '#lib/ui/CommandPalette.svelte';
	import { runShortcut } from '#lib/commands.ts';
	import { workspaceCommands } from './commands.ts';
	import Notice from '#lib/ui/Notice.svelte';
	import Panes from '#lib/ui/Panes.svelte';
	import ProgressIcon from '@geordi/ui/ProgressIcon.svelte';
	import Split from '#lib/ui/Split.svelte';
	import TitleBar from '@geordi/ui/TitleBar.svelte';
	import {
		closeTerminal,
		continueWorkspace,
		approveRun,
		editReleaseNote,
		jobsReady,
		openLink,
		restoreWorktree,
		restoreWorkspace,
		runSetup,
		runTasks,
		say,
		startJobs,
		stopTask,
		stopJob,
		updateWorkspace
	} from '../../../routes/workspaces.remote';
	import { addedNoteCount } from '#lib/release-notes.ts';
	import { pullActionPending, runPullAction, reviewProblems } from './review.svelte.ts';
	import { archive as archiveWorkspace, archiveProblems, beingArchived } from './archive.svelte.ts';
	import PullRequestTab from '@geordi/ui/PullRequestTab.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import PullRequestPane from '@geordi/ui/PullRequestPane.svelte';
	import Changes from '@geordi/ui/Changes.svelte';
	import CombinedDiffFile from './CombinedDiffFile.svelte';
	import DiffSection from '@geordi/ui/DiffSection.svelte';
	import PatchView from '../PatchView.svelte';

	import DiffStat from '@geordi/ui/DiffStat.svelte';
	import Changeset from './Changeset.svelte';
	import Conversation from './Conversation.svelte';
	import { foreground } from '#lib/foreground.svelte.ts';
	import SourceWindow from './SourceWindow.svelte';
	import DiffWindow from './DiffWindow.svelte';
	import NewWorkspace from './NewWorkspace.svelte';
	import Terminal from './Terminal.svelte';
	import WorkspaceActions from '@geordi/ui/WorkspaceActions.svelte';

	type Props = {
		/** The workspace as it is now: it comes live, over the page's one connection. */
		workspace: WorkspaceLive;
	};
	let { workspace }: Props = $props();
	// (never another's: the page makes a new view for each workspace)
	// svelte-ignore state_referenced_locally
	const id = workspace.id;

	/** A project (FDR-012) is conversations and nothing else: no repository, no changes, no terminals. */
	const project = $derived(workspace.repoId === null);
	// its repository, as everyone knows it; by its ID until that has come
	const everything = follow<Navigation>('navigation');
	const repo = $derived(
		everything.current?.repos.find((repo) => repo.id === workspace.repoId) ?? {
			id: workspace.repoId ?? '',
			name: workspace.repoId ?? 'Project'
		}
	);
	let columnWidth = $state<number>();
	const firstPrompt = $derived(workspace.transcript.find((item) => item.kind === 'user')?.text);
	const git = $derived(workspace.git);
	// Local Git can answer before the upstream lookup. Keep the last complete result
	// for the ribbon and its pull request tab while the next check is in flight.
	let lastChecked = $state.raw<WorkspaceLive['git']>(null);
	$effect.pre(() => {
		if (!git?.checking) lastChecked = git;
	});
	const checked = $derived(git?.checking ? lastChecked : git);
	const pull = $derived(checked?.upstream?.pull);
	const running = $derived(workspace.status === 'running');
	const offline = $derived(everything.current?.harnesses === null);
	const waiting = (conversation: { pendingDelivery?: boolean }) =>
		!!conversation.pendingDelivery && offline;

	// A workspace has a fixed frame of three areas: the main one, and beside it one above
	// the other (the side, and the dock). Windows are tabs named after what they show: the
	// conversation, the workspace's `changes` and its `changeset`, `diff` and
	// `terminal:<name>`. The conversation lives in the main area; everything else can be
	// dragged from any area to any other.
	const CHAT = 'chat';
	const PR = 'pr';
	const COMBINED = 'combined-diff';
	const TURN = 'turn-changes';
	let selectedTurn = $state.raw<TurnChanges>();
	const CHANGES = 'changes';
	/** The repository's links and jobs, and how they are: in the dock, where their output is. */
	const RUN = 'run';
	const CHANGESET = 'changeset';
	/** A conversation that has not begun: there is one at most. */
	const DRAFT = 'draft';
	const sourceOf = (tab: string) => (tab.startsWith('source:') ? tab.slice(7) : undefined);
	const terminalOf = (tab: string) => (tab.startsWith('terminal:') ? tab.slice(9) : undefined);
	/** An agent working alongside this workspace's own (`agent:<its workspace's ID>`). */
	const aideOf = (tab: string) =>
		tab.startsWith('agent:') ? workspace.aides.find((aide) => aide.id === tab.slice(6)) : undefined;

	const reviewerTab = (owner: string, child: string) =>
		'subagent:' + JSON.stringify([owner, child]);
	const reviewers = $derived.by(() => {
		const found = new SvelteMap<
			string,
			{
				owner: WorkspaceLive['aides'][number];
				child: SubagentItem;
				parentTab: string;
				parentName: string;
			}
		>();
		function collect(
			owner: WorkspaceLive['aides'][number],
			items: Workspace['transcript'] | SubagentItem['items'],
			parentTab: string,
			parentName: string
		) {
			for (const child of items) {
				if (child.kind !== 'subagent') continue;
				const tab = reviewerTab(owner.id, child.id);
				found.set(tab, { owner, child, parentTab, parentName });
				collect(owner, child.items, tab, child.title || 'Subagent');
			}
		}
		for (const owner of [workspace, ...workspace.aides])
			collect(
				owner,
				owner.transcript,
				owner.id === id ? CHAT : `agent:${owner.id}`,
				agentName[owner.agent]
			);
		return found;
	});

	// How the windows are arranged, and the sizes of the frame, are remembered in this browser.
	// (`id` never changes: the page creates a new view per workspace.)
	const ribbonPosition = getRibbonPosition();
	const arrangement = persisted<Arrangement>(`geordi:arrangement:${id}`, {});
	const saved = $derived(restoreDiff(arrangement.current));
	const frame = persisted<{
		side: number;
		changes: number;
		open: boolean;
		/** The sheet beside the conversation folded to its tab row, if one is. */
		fold?: 'side' | 'dock' | null;
	}>('geordi:frame', { side: 0.28, changes: 0.45, open: true, fold: null });
	/** How the Changes tab shows its files: a preference of this browser, like the frame. */
	const changesView = persisted<'list' | 'tree'>('geordi:changes-view', 'list');
	const toggleSide = () => (frame.current = { ...frame.current, open: !frame.current.open });
	/** Folds one of the two sheets beside the conversation, or unfolds it: never both at once. */
	const toggleFold = (area: 'side' | 'dock') =>
		(frame.current = { ...frame.current, fold: frame.current.fold === area ? null : area });

	const terminalTitles = new SvelteMap<string, string>();
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
		if (tab === COMBINED) return !project;
		if (tab === TURN) return !!selectedTurn;
		if (tab === PR) return !!pull;
		if (tab === CHANGESET) return !!workspace.git?.release;
		if (tab === RUN) return runnable;
		if (tab === DRAFT) return drafting;
		if (tab.startsWith('subagent:')) return reviewers.has(tab);
		if (tab.startsWith('agent:')) return !!aideOf(tab);
		return (
			tab === CHAT || tab === CHANGES || (tab === 'diff' && !!saved.diffPath) || !!sourceOf(tab)
		);
	};
	/** The three areas' windows: as they were arranged, and what is new where it belongs. */
	const layouts = $derived.by((): Record<Area, Layout> => {
		const placed: string[] = [];
		// a window is in one place only: where it was put first, going through the areas
		const arranged = (area: Area) => {
			const layout = prune(
				saved[area] ?? singleGroup([], { id: area }),
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
		for (const tab of [CHANGES, PR, CHANGESET])
			if (exists(tab) && !placed.includes(tab)) side = add(side, tab);
		if (exists(RUN) && !placed.includes(RUN)) dock = add(dock, RUN);
		for (const name of workspace.terminals) {
			if (isRunTerminal(name)) continue;
			if (!placed.includes(`terminal:${name}`)) dock = add(dock, `terminal:${name}`);
		}
		return { main, side, dock };
	});
	// Forget closed job terminals so a later run does not restore an old tab.
	$effect(() => {
		for (const area of ['main', 'side', 'dock'] as const) {
			const layout = arrangement.current[area];
			if (!layout) continue;
			const next = prune(layout, (tab) => {
				const terminal = terminalOf(tab);
				return !terminal || !jobOf(terminal) || workspace.terminals.includes(terminal);
			});
			if (next !== layout) arrangement.current = { ...arrangement.current, [area]: next };
		}
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
	/** Whether there is anything to run, or something to say about the file that says so. */
	const runnable = $derived(jobs.length > 0 || links.length > 0 || !!config?.problem);
	const jobOf = (terminal?: string) =>
		terminal?.startsWith(JOB_TERMINAL) ? terminal.slice(JOB_TERMINAL.length) : undefined;
	function isRunTerminal(terminal: string) {
		const job = jobOf(terminal);
		return !!job && !SCRIPTS.some((script) => script === job);
	}
	const runJob = $derived(jobs.find((job) => config?.default === `jobs.${job.name}`));
	const runLink = $derived(links.find((link) => config?.default === `urls.${link.name}`));
	function runLive(job: string) {
		const state = jobState(job);
		return state === 'running' || state === 'starting';
	}
	function runDefault() {
		if (config?.tasks) {
			const selected = config.tasks.filter((task) => task.default).map((task) => task.name);
			return selected.length ? launchTasks(selected) : showTab(RUN);
		}
		if (runJob) return runLive(runJob.name) ? stop(runJob.name) : start([runJob.name]);
		if (runLink) visit(runLink);
	}
	const jobTab = (job: string) => `terminal:${JOB_TERMINAL}${job}`;
	/** A job runs while its terminal is there and its command has not ended in it. */
	const isUp = (job: string) =>
		workspace.terminals.includes(JOB_TERMINAL + job) && !(JOB_TERMINAL + job in workspace.finished);
	/** How a job is: up once it listens on its port; over, and how it went, once it ended. */
	function jobState(job: string): JobState {
		const terminal = JOB_TERMINAL + job;
		const ended = workspace.finished[terminal];
		if (workspace.terminals.includes(terminal) && ended !== undefined) return { ended };
		if (launching.has(job)) return 'starting';
		return isUp(job) ? 'running' : 'stopped';
	}
	const labelOf = (job: string) => jobs.find((other) => other.name === job)?.label ?? job;

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
		const needed = startOrder(jobs, names).flatMap(
			(name) => jobs.find((job) => job.name === name) ?? []
		);
		const seen = Object.fromEntries(needed.map((job) => [job.name, job.command]));
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
				show('setup');
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

	let blocked = $state<{
		workspaceId: string;
		conflict: PortConflict & { job: string };
		retry: () => void;
	} | null>(null);

	/** Starts jobs and their dependencies. */
	function start(names: string[], confirmation?: string) {
		const workspaceId = id;
		agreed(names, async (seen) => {
			const order = startOrder(jobs, names);
			for (const name of order) launching.add(name);
			mergeProblem = null;
			try {
				const conflict = await startJobs({ workspaceId, jobs: names, seen, confirmation });
				if (conflict) {
					blocked = { workspaceId, conflict, retry: () => start(names, conflict.confirmation) };
					return;
				}
				await jobsReady({ workspaceId, jobs: order });
			} catch (error) {
				mergeProblem = problemOf(error, 'Could not start that');
			} finally {
				for (const name of order) launching.delete(name);
			}
		});
	}

	/** Brings a job's terminal to the front: in the dock, unless it was put elsewhere. */
	function show(job: string) {
		const front = jobTab(job);
		const at = areaOf(front) ?? 'dock';
		if (at !== 'main' && !frame.current.open) toggleSide();
		arrange({ [at]: open(layouts[at], front) });
	}

	const stop = (job: string) => stopJob({ workspaceId: id, job }).catch(() => {});

	const readyLinks = new SvelteMap<string, string>();

	function launchTasks(names: string[], confirmation?: string) {
		const workspaceId = id;
		const commands = startOrder(config?.tasks ?? [], names).filter((name) =>
			jobs.some((job) => job.name === name)
		);
		agreed(commands, async (seen) => {
			const tabs = new SvelteMap<string, Window | null>();
			for (const name of names) {
				readyLinks.delete(name);
				if (links.some((link) => link.name === name) && !('geordiDesktop' in globalThis))
					tabs.set(name, globalThis.open('about:blank', '_blank'));
			}
			const booting = commands.filter((name) => !isUp(name));
			for (const name of booting) launching.add(name);
			mergeProblem = null;
			try {
				const results = await runTasks({ workspaceId, tasks: names, seen, confirmation });
				const problems = new SvelteSet<string>();
				for (const { name, href, problem } of results) {
					if (problem) problems.add(problem);
					if (!href) continue;
					const tab = tabs.get(name);
					if (tab && !tab.closed) {
						tab.opener = null;
						tab.location.href = href;
						tabs.delete(name);
					} else if ('geordiDesktop' in globalThis) globalThis.open(href, '_blank', 'noopener');
					else {
						readyLinks.set(name, href);
						showTab(RUN);
					}
				}
				mergeProblem = [...problems].join(' · ') || null;
				const conflict = results.find((result) => result.conflict)?.conflict;
				if (conflict)
					blocked = {
						workspaceId,
						conflict,
						retry: () =>
							launchTasks(
								results.filter((result) => result.conflict).map((result) => result.name),
								conflict.confirmation
							)
					};
			} catch (error) {
				mergeProblem = problemOf(error, 'Could not run tasks');
			} finally {
				for (const tab of tabs.values()) tab?.close();
				for (const name of booting) launching.delete(name);
			}
		});
	}

	/** Opens a link in the browser, once the jobs it needs are up. */
	function visit(link: (typeof links)[number], confirmation?: string) {
		const workspaceId = id;
		agreed(link.needs, async (seen) => {
			// a new tab has to be opened while the click still counts; where to comes later
			// (`window` is the name of a snippet in here)
			const tab = globalThis.open('about:blank', '_blank');
			const booting = startOrder(jobs, link.needs).filter((name) => !isUp(name));
			for (const name of booting) launching.add(name);
			mergeProblem = null;
			try {
				const href = await openLink({ workspaceId, link: link.name, seen, confirmation });
				if (typeof href !== 'string') {
					tab?.close();
					blocked = { workspaceId, conflict: href, retry: () => visit(link, href.confirmation) };
					return;
				}
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

	/** Focuses the terminal in view (or the first), or opens a new one when already in one. */
	function goToTerminal() {
		const shells = shellTabs();
		const selected = Object.values(layouts)
			.flatMap(groupsOf)
			.find((group) => group.active && shells.includes(group.active));
		const existing = selected?.active ?? shells[0];
		if (existing && !document.activeElement?.closest('.xterm')) showShell(existing);
		else openNewTerminal();
	}
	function showShell(tab: string) {
		focusTerminal = terminalOf(tab);
		showTab(tab);
	}
	/** Terminals without a job in them, in the order they were opened. */
	const shellTabs = () => everywhere().filter((tab) => terminalOf(tab) && !jobOf(terminalOf(tab)));
	function openNewTerminal() {
		if (!frame.current.open) toggleSide();
		arrange({ dock: open(dock, newTerminal()) });
	}

	/** Remembers a new arrangement. Run terminals can be reopened from the job row. */
	function arrange(next: Partial<Record<Area, Layout>>, diffPath = saved.diffPath) {
		const after = { ...layouts, ...next };
		const remaining = Object.values(after).flatMap(tabsOf);
		if (!remaining.includes(DRAFT)) drafting = false;
		// A closed terminal hands the keyboard to the terminal shown in its place.
		const before = new Map(
			Object.values(layouts)
				.flatMap(groupsOf)
				.map((g) => [g.id, g.active])
		);
		for (const group of Object.values(after).flatMap(groupsOf)) {
			const was = before.get(group.id);
			if (was && terminalOf(was) && !remaining.includes(was) && terminalOf(group.active ?? ''))
				focusTerminal = terminalOf(group.active!);
		}
		for (const tab of everywhere()) {
			const terminal = terminalOf(tab);
			const source = sourceOf(tab);
			if (source && !remaining.includes(tab)) citations.delete(source);
			const aide = aideOf(tab);
			// Its live workspace keeps the tab in place until archiving succeeds.
			if (aide && !remaining.includes(tab)) {
				void archiveWorkspace(aide.id, aide.title).then(() => {
					const problem = archiveProblems[aide.id];
					if (problem) mergeProblem = problem;
				});
				return;
			}
			if (terminal && !remaining.includes(tab) && !isRunTerminal(terminal)) {
				terminalTitles.delete(tab);
				starting.delete(terminal);
				const job = jobOf(terminal);
				if (job) stop(job);
				else closeTerminal({ workspaceId: id, terminal }).catch(() => {});
			}
		}
		// Using a folded sheet's tabs, or opening a window in it, unfolds it; closing one doesn't.
		const folded = frame.current.fold;
		if (folded && next[folded]) {
			const tabs = new Set(tabsOf(after[folded]));
			if (tabsOf(layouts[folded]).every((tab) => tabs.has(tab)))
				frame.current = { ...frame.current, fold: null };
		}
		arrangement.current = { ...after, diffPath: remaining.includes('diff') ? diffPath : undefined };
	}

	/** Move a window between areas in one arrangement change. */
	const receive =
		(to: Area) => (tab: string, groupId: string, zone: Zone, before?: string | null) => {
			const from = areaOf(tab);
			if (!from || from === to) return;
			const placed = insert(layouts[to], tab, groupId, zone, before);
			// nowhere to put it (the group is gone): leave the window where it is
			if (placed === layouts[to]) return;
			arrange({ [to]: placed, [from]: close(layouts[from], tab) });
		};
	function promote(tab: string) {
		if (chatGroup) receive('main')(tab, chatGroup, 'center');
	}
	/** Where a window belongs beside the main area, if it does. */
	const homeOf = (tab: string): Area | undefined =>
		tab === CHANGES || tab === PR || tab === CHANGESET
			? 'side'
			: tab === RUN || terminalOf(tab)
				? 'dock'
				: undefined;
	/** Send a window from the main area back to where it belongs. */
	function demote(tab: string) {
		const home = homeOf(tab);
		const group = home && groupsOf(layouts[home])[0];
		if (!home || !group || !workspace.worktree) return;
		if (!frame.current.open) toggleSide();
		receive(home)(tab, group.id, 'center');
	}

	/** The conversation stays where it is, and what a workspace always has can't be closed. */
	const movable = (tab: string) => tab !== CHAT;
	const closable = (tab: string) =>
		tab !== CHAT &&
		tab !== CHANGES &&
		tab !== PR &&
		tab !== CHANGESET &&
		tab !== RUN &&
		// not from under an agent at work
		aideOf(tab)?.status !== 'running';

	/** Focus the tab where it is, or open it next to the conversation. */
	const showTab = (tab: string, diffPath = saved.diffPath) => {
		const area = areaOf(tab) ?? 'main';
		if (area !== 'main' && !frame.current.open) toggleSide();
		arrange({ [area]: open(layouts[area], tab, chatGroup) }, diffPath);
	};
	// Double-clicked in the sidebar: the conversation comes to the front, ready to write in.
	let focusChat = $state(false);
	$effect(() => {
		if (!foreground.take(id)) return;
		untrack(() => showTab(CHAT));
		focusChat = true;
	});
	function openTurn(changes: TurnChanges) {
		selectedTurn = changes;
		showTab(TURN);
	}
	let diffSelection = $state(0);
	function openDiff(path: string) {
		diffSelection++;
		showTab('diff', path);
	}

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
			citations.set(path, { line });
			showTab(`source:${path}`);
		},
		open: openDiff
	});

	const askingAgent = $derived([workspace, ...workspace.aides].find((agent) => agent.asking));
	let questionTarget = $state<{ owner: string; id: string; done(): void }>();

	// Consume the link once so the same question can be opened again after switching tabs.
	$effect(() => {
		if (page.params.id !== id || !page.url.searchParams.has('question')) return;
		untrack(() => {
			void goto(resolve('/workspaces/[id]', { id }), {
				shallow: true,
				replace: true,
				state: page.state
			});
			const question = askingAgent?.transcript.find(
				(item) => item.kind === 'question' && item.open && item.blocking !== false
			);
			if (!askingAgent || question?.kind !== 'question') return;
			showTab(askingAgent.id === id ? CHAT : `agent:${askingAgent.id}`);
			questionTarget = {
				owner: askingAgent.id,
				id: question.id,
				done: () => (questionTarget = undefined)
			};
		});
	});

	// A link to an agent working alongside leads here, to its conversation (`?agent=`). So
	// does beginning one: it takes the place of the window it was begun in.
	$effect(() => {
		const requested = page.url.searchParams.get('agent');
		if (!requested || page.params.id !== id) return;
		const tab = requested === id ? CHAT : `agent:${requested}`;
		untrack(() => {
			const at = areaOf(tab);
			if (!at) return;
			void goto(resolve('/workspaces/[id]', { id }), {
				shallow: true,
				replace: true,
				state: page.state
			});
			const begun = tab !== CHAT && areaOf(DRAFT);
			if (!begun) return showTab(tab);
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
	/**
	 * The workspace had a worktree, and it is no longer there: removed outside Geordi. Not
	 * while the agent is at work, which is when it comes back.
	 */
	const worktreeGone = $derived(
		!!workspace.worktree && !!checked?.missing && !running && !workspace.archivedAt
	);
	/** Terminals are for a workspace with a worktree to work in. */
	const terminalsOpen = $derived(
		!project && !workspace.archivedAt && !!workspace.worktree && !worktreeGone
	);
	const standingState = $derived(
		workspace.archivedAt
			? { archived: true, changes: null, upstream: null }
			: !checked?.changes
				? null
				: {
						changes: checked.changes,
						upstream: checked.upstream,
						continued: workspace.continued,
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
	// Until the daemon has said how the worktree stands, say that it is being asked.
	const standing = $derived<WorkspaceStanding | null>(
		worktreeGone
			? { label: 'Worktree removed', tone: 'neutral', icon: 'icon-[lucide--folder-x]' }
			: standingState
				? standingOf(standingState)
				: workspace.worktree && !workspace.archivedAt
					? {
							label: 'Checking…',
							tone: 'neutral',
							icon: 'icon-[lucide--circle-dashed] animate-checks-spin'
						}
					: null
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
					: pullActionPending(id, action) ||
						(action.id === 'restore-workspace' && restoringWorkspace) ||
						(action.id === 'archive' && leaving) ||
						(action.id === 'continue' && continuing)
			)
			.map((a) => a.id);
	});

	/** Why archiving didn't work, if it didn't. */
	const archiveProblem = $derived(archiveProblems[id]);

	/** It is being archived right now, which takes a moment. */
	const leaving = $derived(beingArchived.has(id));

	/** Why merging (or restoring the worktree) didn't work, if it didn't. */
	let mergeProblem = $state<string | null>(null);

	let restoringWorkspace = $state(false);
	async function reopen() {
		restoringWorkspace = true;
		mergeProblem = null;
		try {
			await restoreWorkspace(id);
			if (page.params.id === id && workspace.worktreeId !== id) await invalidateAll();
		} catch (error) {
			mergeProblem = problemOf(error, 'Could not restore the workspace');
		} finally {
			restoringWorkspace = false;
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
	 * was asked for already stays, to show that it is under way. Continuing moves the files
	 * under every agent in the worktree: it waits until none is at work.
	 */
	const offered = $derived(
		actions
			.filter(
				(action) => !working || !PUBLISHING.includes(action.id) || pending.includes(action.id)
			)
			.map((action) =>
				working && action.id === 'continue'
					? { ...action, unavailable: 'Continue once the agent is done' }
					: action
			)
	);

	async function act(action: WorkspaceAction) {
		// Geordi's to do where git can, the agent's where it takes judgement
		if (action.id === 'merge-upstream' && action.prompt) update(action.prompt);
		else if (action.prompt) say({ workspaceId: id, text: action.prompt, action: action.id });
		else if (action.pullNumber) {
			mergeProblem = null;
			await runPullAction(id, action);
		} else if (action.id === 'restore-worktree') restore();
		else if (action.id === 'restore-workspace') await reopen();
		else if (action.id === 'continue') carryOn();
		else if (action.id === 'archive') void archiveAndNavigate(workspace);
	}

	// Everything in the workspace to go to, or do, found by typing a few letters of it.
	let palette = $state(false);
	const commandList = $derived(
		workspaceCommands({
			conversations: [
				{ tab: CHAT, label: agentName[workspace.agent], icon: 'icon-[lucide--message-square]' },
				...workspace.aides.map((aide) => ({
					tab: `agent:${aide.id}`,
					label: aide.title,
					icon: 'icon-[lucide--message-square]',
					keywords: agentName[aide.agent]
				})),
				...[...reviewers].map(([tab, { child, parentName }]) => ({
					tab,
					label: child.title || 'Subagent',
					icon: 'icon-[lucide--bot]',
					keywords: parentName
				}))
			],
			canBegin: !workspace.archivedAt,
			shells: terminalsOpen
				? shellTabs()
						.sort()
						.map((tab, index) => ({
							tab,
							title: terminalTitles.get(tab) || `Terminal ${index + 1}`
						}))
				: null,
			canRunDefault: !!(runJob || runLink || (config?.tasks && runnable)) && !workspace.archivedAt,
			// nothing to run without a worktree to run it in
			tasks: !terminalsOpen
				? []
				: (config?.tasks?.map(({ name, label }) => ({ name, label: label ?? name })) ?? null),
			jobs: !terminalsOpen
				? []
				: jobs.map(({ name }) => ({ name, label: labelOf(name), live: runLive(name) })),
			links: !terminalsOpen ? [] : links.map(({ name, label }) => ({ name, label: label ?? name })),
			outputs: workspace.terminals
				.filter(isRunTerminal)
				.map((terminal) => jobOf(terminal)!)
				.map((name) => ({ name, label: labelOf(name) })),
			windows: project
				? null
				: (
						[
							[CHANGES, 'Changes', 'icon-[lucide--file-diff]'],
							[COMBINED, 'Combined diff', 'icon-[lucide--files]'],
							[PR, `Pull request #${pull?.number}`, 'icon-[lucide--git-pull-request]'],
							[CHANGESET, 'Changeset', 'icon-[lucide--package]'],
							[RUN, 'Run', 'icon-[lucide--play]']
						] as const
					)
						.filter(([tab]) => exists(tab))
						.map(([tab, label, icon]) => ({ tab, label, icon })),
			sideOpen: project || workspace.archivedAt ? null : frame.current.open,
			changedFiles: git?.changes?.files.map((file) => file.path) ?? [],
			actions: offered.filter((action) => !pending.includes(action.id) && !action.unavailable),

			show: (tab) => {
				if (terminalOf(tab)) return showShell(tab);
				showTab(tab);
				if (tab === CHAT) focusChat = true;
			},
			newConversation: () => showTab(newConversation()),
			terminal: goToTerminal,
			newTerminal: openNewTerminal,
			runDefault,
			runTask: (name) => launchTasks([name]),
			start: (job) => start([job]),
			stop,
			visit: (name) => {
				const link = links.find((link) => link.name === name);
				if (link) visit(link);
			},
			showOutput: show,
			toggleSide,
			openDiff,
			act: (action) => void act(action)
		})
	);
</script>

<svelte:head><title>{workspace.title} · Geordi</title></svelte:head>

<svelte:window
	onkeydowncapture={(event) => {
		// before a terminal or the reply box can make them their own
		if (pressed(event, 'palette')) {
			event.preventDefault();
			if (!event.repeat) palette = !palette;
		} else if (!runShortcut(event, commandList)) return;
		event.stopPropagation();
	}}
/>

<!-- A count at the end of a tab: nearer the tab's edge than text would be, being a shape itself. -->
{#snippet count(n: number)}
	<span class="-mr-1 flex"><Badge>{n}</Badge></span>
{/snippet}

{#snippet tab(tab: string)}
	{@const reviewer = reviewers.get(tab)}
	{@const path = tab === 'diff' ? saved.diffPath : sourceOf(tab)}
	{#if tab === COMBINED}
		<span class="icon-[lucide--files] size-3.5 shrink-0"></span>
		<span>Combined diff</span>
	{:else if tab === TURN}
		<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
		<span>Turn {selectedTurn?.number} changes</span>
	{:else if tab === RUN}
		<RunTab {jobs} stateOf={jobState} />
	{:else if tab === CHANGES}
		<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
		<span class="truncate">Changes</span>
		{#if git?.changes?.files.length}
			{@const files = git.changes.files}
			<DiffStat
				added={files.reduce((sum, file) => sum + (file.added ?? 0), 0)}
				removed={files.reduce((sum, file) => sum + (file.removed ?? 0), 0)}
			/>
		{/if}
	{:else if tab === PR && pull}
		<PullRequestTab {pull} />
	{:else if tab === CHANGESET}
		{@const added = addedNoteCount(git?.release?.packages ?? [])}
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
			<!-- running; or over, and how it went: its output is still there to be read -->
			<JobMark state={jobState(job)} />
			<span class="truncate">{labelOf(job)}</span>
		{:else}
			{@const terminals = everywhere()
				.filter((other) => terminalOf(other) && !jobOf(terminalOf(other)))
				.sort()}
			{@const title = terminalTitles.get(tab) || `Terminal ${terminals.indexOf(tab) + 1}`}
			<span class="icon-[lucide--square-terminal] size-3.5 shrink-0"></span>
			<span class="truncate" {title}>{title}</span>
		{/if}
	{:else if tab === DRAFT}
		<span class="icon-[lucide--message-square-plus] size-3.5 shrink-0"></span>
		<span class="truncate">New conversation</span>
	{:else if reviewer}
		<ConversationTab
			subagent
			agent={reviewer.owner.agent}
			title={reviewer.child.title || 'Subagent'}
			running={reviewer.child.state === 'running'}
		/>
	{:else if aideOf(tab)}
		{@const aide = aideOf(tab)!}
		<ConversationTab
			agent={aide.agent}
			title={aide.title}
			running={aide.status === 'running'}
			waiting={waiting(aide)}
		/>
	{:else}
		<ConversationTab agent={workspace.agent} {running} waiting={waiting(workspace)} />
	{/if}
{/snippet}

{#snippet window(tab: string)}
	{@const reviewer = reviewers.get(tab)}
	{@const path = tab === 'diff' ? saved.diffPath : undefined}
	{@const terminal = terminalOf(tab)}
	{@const source = sourceOf(tab)}
	{#if tab === COMBINED}
		<div class="scroller space-y-2 p-3">
			{#if git?.unavailable}
				<p class="text-sm text-muted">{git.unavailable}</p>
			{:else if !git?.changes}
				<p class="text-sm text-muted">Loading the changes…</p>
			{:else}
				{#each git.changes.files as file (file.path)}
					<DiffSection path={file.path} added={file.added} removed={file.removed}>
						<CombinedDiffFile workspaceId={id} path={file.path} version={git.version} />
					</DiffSection>
				{:else}
					<p class="text-sm text-muted">No changes yet</p>
				{/each}
			{/if}
		</div>
	{:else if tab === TURN && selectedTurn}
		<div class="scroller px-3 pb-4">
			{#key selectedTurn}
				<header
					class="flex items-center gap-3 px-2 py-3"
					title="Worktree changes during this turn, including concurrent edits"
				>
					<h2 class="text-base heading">
						{selectedTurn.diff.files.length}
						{selectedTurn.diff.files.length === 1 ? 'file' : 'files'} changed
					</h2>
					<DiffStat added={selectedTurn.diff.added} removed={selectedTurn.diff.removed} />
				</header>
				<PatchView diff={selectedTurn.diff} collapsible />
			{/key}
		</div>
	{:else if tab === RUN}
		<RunPane
			tasks={config?.tasks}
			launch={launchTasks}
			defaultAction={config?.default}
			shortcut="runDefault"
			{jobs}
			{links}
			stateOf={jobState}
			hasTerminal={(name) => workspace.terminals.includes(JOB_TERMINAL + name)}
			{start}
			{stop}
			{show}
			{visit}
		>
			{#each readyLinks as [name, href] (name)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the task URL belongs to its local server -->
				<a class="item" {href} target="_blank" rel="noopener"
					>Open {links.find((link) => link.name === name)?.label ?? name} in browser</a
				>
			{/each}
			{#if config?.problem}
				<Notice>The repository's configuration can't be read: {config.problem}</Notice>
			{/if}
		</RunPane>
	{:else if tab === CHANGES}
		<Changes
			{git}
			gone={worktreeGone ? (workspace.worktree?.branch ?? null) : null}
			onopen={openDiff}
			onopencombined={() => showTab(COMBINED)}
			bind:view={changesView.current}
		/>
	{:else if tab === PR && pull}
		<PullRequestPane {pull}
			>{#snippet description(text: string)}<Markdown {text} />{/snippet}</PullRequestPane
		>
	{:else if tab === CHANGESET}
		{#if git?.release}
			<Changeset
				plan={git.release}
				onsave={(path, original, body) =>
					editReleaseNote({ workspaceId: id, path, original, body })}
				onopen={openDiff}
				onallow={(command) =>
					approveRun({ workspaceId: id, commands: [command] }).catch(
						(error) => (mergeProblem = problemOf(error, 'Could not note that'))
					)}
			/>
		{:else}
			<p class="flex items-center gap-2 p-5 text-sm text-muted">
				<ProgressIcon label="Loading changeset" /> Loading changeset…
			</p>
		{/if}
	{:else if path}
		<!-- loaded again whenever the worktree's files may have changed -->
		{#key `${diffSelection}:${path}`}
			<DiffWindow workspaceId={id} {path} version={git?.version ?? 0} />
		{/key}
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
			ontitle={jobOf(terminal) ? undefined : (title) => terminalTitles.set(tab, title)}
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
	{:else if reviewer}
		<MessageView
			blocks={subagentBlocks(reviewer.child)}
			onstoptask={(stopId) => stopTask({ workspaceId: reviewer.owner.id, stopId })}
			background={reviewer.owner.background?.filter((task) => task.session === reviewer.child.id)}
			parentAgent={{ name: reviewer.parentName, open: () => showTab(reviewer.parentTab) }}
			agent={reviewer.owner.agent}
			running={reviewer.child.state === 'running' || reviewer.child.state === 'waiting'}
			cwd={reviewer.owner.worktree?.path}
			pictures={resolve('/workspaces/[id]/picture', { id: reviewer.owner.id })}
			onopensubagent={(child) => showTab(reviewerTab(reviewer.owner.id, child))}
		/>
	{:else if aideOf(tab)}
		<!-- what its own agent said there is that one's; and so on up -->
		<Conversation
			workspace={aideOf(tab)!}
			questionTarget={questionTarget?.owner === aideOf(tab)!.id ? questionTarget : undefined}
			onopenturn={openTurn}
			waiting={waiting(aideOf(tab)!)}
			onopensubagent={(child) => showTab(reviewerTab(aideOf(tab)!.id, child))}
			senders={{ ...workspace.senders, [workspace.id]: workspace.title }}
		/>
	{:else}
		<Conversation
			{workspace}
			autofocus={focusChat}
			onautofocus={() => (focusChat = false)}
			questionTarget={questionTarget?.owner === id ? questionTarget : undefined}
			onopenturn={openTurn}
			waiting={waiting(workspace)}
			onopensubagent={(child) => showTab(reviewerTab(id, child))}
			senders={workspace.senders}
		/>
	{/if}
{/snippet}

<main class="flex h-below-bar min-w-0 flex-col overflow-hidden md:h-dvh">
	<TitleBar
		contentWidth={ribbonPosition.current === 'pane' && frame.current.open && !project
			? columnWidth
			: undefined}
	>
		<div class="min-w-0 flex-1">
			<WorkspaceHeading
				title={workspace.title}
				prompt={workspace.named ? undefined : firstPrompt}
				{columnWidth}
			/>
			<div class="flex items-center gap-3 overflow-hidden text-xs whitespace-nowrap text-muted">
				<span
					class={['flex min-w-0 items-center gap-1', workspace.worktree && 'max-w-1/2']}
					title={repo.name}
				>
					<span
						class={[
							project ? 'icon-[lucide--folder-kanban]' : 'icon-[lucide--folder-git-2]',
							'size-3.5 shrink-0'
						]}
					></span>
					<span class="truncate">{repo.name}</span>
				</span>
				{#if workspace.worktree}
					<span class="flex min-w-0 items-center gap-1" title={workspace.worktree.path}>
						<span class="icon-[lucide--git-branch] size-3.5 shrink-0"></span>
						<span class="truncate code-dense" title={workspace.worktree.branch}
							>{workspace.worktree.branch}</span
						>
					</span>
				{/if}
			</div>
		</div>
		{#snippet actions()}
			<WorkspaceActions
				{standing}
				pull={standingState?.upstream?.pull}
				actions={offered}
				unreachable={workspace.archivedAt ? null : checked?.upstreamProblem}
				disabled={!workspace.archivedAt &&
					!!git?.checking &&
					git.changes?.branch !== checked?.changes?.branch}
				{pending}
				askingIn={askingAgent ? resolve('/workspaces/[id]', { id }) : undefined}
				onopenpull={() => showTab(PR)}
				onaction={act}
			/>
		{/snippet}
		{#snippet trailing()}
			{#if !workspace.archivedAt && !project}
				<Button
					variant="ghost"
					icon={frame.current.open
						? 'icon-[lucide--panel-right-close]'
						: 'icon-[lucide--panel-right-open]'}
					label="Toggle changes and terminals ({hint('toggleSide')})"
					onclick={toggleSide}
				/>
			{/if}
		{/snippet}
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

	{#if mergeProblem || reviewProblems[id]}
		<div class="flex items-center gap-3 px-5 py-2.5">
			<div class="min-w-0 flex-1"><Notice>{mergeProblem ?? reviewProblems[id]}</Notice></div>
			<Button
				variant="ghost"
				onclick={() => {
					mergeProblem = null;
					delete reviewProblems[id];
				}}>Dismiss</Button
			>
		</div>
	{/if}

	<!-- room for a conversation to be read in, and for file names beside their line counts -->
	<Split
		dir="row"
		bare
		min={[320, 260]}
		minRatio={0.5}
		collapsed={!frame.current.open || project}
		bind:ratio={
			() => 1 - frame.current.side,
			(ratio) => (frame.current = { ...frame.current, side: 1 - ratio })
		}
	>
		{#snippet a()}
			<!-- what is read, as a sheet in the frame: as far from the window's edge as the others, -->
			<!-- and half a gap from what is beside it, where there is something -->
			<div
				bind:clientWidth={columnWidth}
				class={[
					'mb-2 ml-2 flex min-h-0 flex-1 flex-col sheet',
					frame.current.open && !project ? 'mr-1' : 'mr-2'
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
					ondoubleclick={demote}
					newTab={workspace.archivedAt ? undefined : newConversation}
					newLabel="New conversation"
					newIcon="icon-[lucide--message-square-plus]"
				/>
			</div>
		{/snippet}
		{#snippet b()}
			{#if workspace.worktree}
				{#snippet foldButton(area: 'side' | 'dock')}
					{@const folded = frame.current.fold === area}
					<Button
						variant="ghost"
						size="sm"
						icon={folded ? 'icon-[lucide--chevron-right]' : 'icon-[lucide--chevron-down]'}
						label={folded ? 'Unfold' : 'Fold'}
						onclick={() => toggleFold(area)}
					/>
				{/snippet}
				<!-- each a sheet of its own, like the conversation: their shapes are what parts them -->
				<Split
					dir="column"
					bare
					min={[120, 120]}
					fold={frame.current.fold === 'side' ? 'a' : frame.current.fold === 'dock' ? 'b' : null}
					bind:ratio={
						() => frame.current.changes,
						(changes) => (frame.current = { ...frame.current, changes })
					}
				>
					{#snippet a()}
						<!-- what the workspace has done: its changes, and what they mean for the next releases -->
						<div
							class={[
								'mr-2 mb-1 ml-1 flex min-h-0 flex-1 flex-col sheet-quiet',
								frame.current.fold === 'side' && 'overflow-hidden'
							]}
						>
							<Panes
								layout={layouts.side}
								onchange={(next) => arrange({ side: next })}
								{tab}
								{window}
								{closable}
								accepts={movable}
								onreceive={receive('side')}
								ondoubleclick={promote}
								splits={false}
							>
								{#snippet lead()}{@render foldButton('side')}{/snippet}
							</Panes>
						</div>
					{/snippet}
					{#snippet b()}
						<div
							class={[
								'mt-1 mr-2 mb-2 ml-1 flex min-h-0 flex-1 flex-col sheet-quiet',
								frame.current.fold === 'dock' && 'overflow-hidden'
							]}
						>
							<Panes
								layout={dock}
								onchange={(next) => arrange({ dock: next })}
								{tab}
								{window}
								{closable}
								accepts={movable}
								onreceive={receive('dock')}
								ondoubleclick={promote}
								splits={false}
								newTab={workspace.archivedAt ? undefined : newTerminal}
								newLabel="New terminal"
								newIcon="icon-[lucide--square-terminal]"
							>
								{#snippet lead()}{@render foldButton('dock')}{/snippet}
							</Panes>
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
		<div class="dialog-actions">
			<Button variant="soft" onclick={() => (asking = null)}>Cancel</Button>
			<Button variant="primary" onclick={agree}>Run</Button>
		</div>
	</div>
</Dialog>

<CommandPalette
	bind:open={palette}
	label="Go to or do in this workspace"
	placeholder="Conversations, terminals, tasks, files…"
	items={commandList}
/>

<PortConflictDialog
	conflict={blocked?.workspaceId === id ? blocked.conflict : null}
	cancel={() => (blocked = null)}
	retry={() => {
		const request = blocked;
		blocked = null;
		if (request?.workspaceId === id) request.retry();
	}}
/>
