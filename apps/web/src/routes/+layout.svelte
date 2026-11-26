<script lang="ts">
	import './layout.css';
	import { sidebarMotion } from '#lib/ui/sidebar-motion.ts';
	import favicon from '#lib/assets/favicon.svg';
	import { untrack } from 'svelte';
	import { innerWidth } from 'svelte/reactivity/window';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ConnectionIndicator from '#lib/components/ConnectionIndicator.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import SidebarToggle from '#lib/components/SidebarToggle.svelte';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import { initRibbonPosition, openSettings, sections } from '#lib/components/settings.svelte.ts';
	import CommandPalette from '#lib/ui/CommandPalette.svelte';
	import { runShortcut } from '#lib/commands.ts';
	import { globalCommands } from '#lib/components/commands.ts';
	import AddRepository from '#lib/components/AddRepository.svelte';
	import { theme } from '#lib/theme.svelte.ts';
	import { daemon } from '#lib/daemon.svelte.ts';
	import { nextUnread, outlineRows, stepThrough } from '#lib/family.ts';
	import { pressed } from '@geordi/ui/keys';
	import { ask, badge, isLooking, seen, unread, watch } from '#lib/notifications.svelte.ts';
	import { persisted } from '@geordi/ui/persisted';
	import { archiving } from '#lib/components/workspace/archive.svelte.ts';
	import { releaseReview } from '#lib/components/workspace/release-review.svelte.ts';
	import ReleaseConfirm from '#lib/components/workspace/ReleaseConfirm.svelte';
	import ArchiveConfirm from '#lib/components/workspace/ArchiveConfirm.svelte';
	import { pickRepo } from '#lib/components/workspace/NewWorkspace.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import ContextMenu from '#lib/ui/ContextMenu.svelte';
	import { setTitleBarLead } from '@geordi/ui/TitleBar.svelte';
	import { connect, connection, follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import { setWorkspaceLinks, workspaceLinks } from '#lib/workspace-links.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	// everything live on the page comes over one connection: this is where it starts
	// svelte-ignore state_referenced_locally
	connect(data.live);
	initRibbonPosition();
	const lost = $derived(connection.state === 'lost');
	const nav = follow<Navigation>('navigation');

	/** The workspace on screen, if any. */
	const viewed = $derived(page.url.pathname.match(/^\/workspaces\/([^/]+)$/)?.[1] ?? null);

	// Branches and pull requests named in agent output link to their workspaces. Rebuilt
	// only when one of those changes: every conversation on screen is rendered anew then.
	const linkable = $derived(
		JSON.stringify(
			(nav.current?.workspaces ?? []).map(({ id, repoId, branch, pull }) => ({
				id,
				repoId,
				branch,
				pull
			}))
		)
	);
	const links = $derived(workspaceLinks(JSON.parse(linkable), viewed));
	setWorkspaceLinks(() => links);

	// Tells of workspaces that need the person, out of their sight (FDR-008)…
	$effect(() => {
		const all = nav.current?.workspaces;
		if (all) untrack(() => watch(all, viewed, (id) => goto(resolve('/workspaces/[id]', { id }))));
	});
	// …and what they look at, they have seen. The rest is counted on the Dock.
	$effect(() => {
		if (viewed && isLooking()) seen(viewed);
	});
	$effect(badge);
	// A daemon has connected: what none could say before is asked again (`daemon.svelte.ts`).
	let daemonConnected = false;
	$effect(() => {
		const connected = !!nav.current && nav.current.harnesses !== null;
		if (connected && !daemonConnected) daemon.connections++;
		daemonConnected = connected;
	});

	// The sidebar can be hidden and made wider or narrower; both are remembered here.
	const sidebar = persisted('geordi:nav', { open: true, width: 256 });
	const visibleSidebar = sidebarMotion(() => sidebar.current.open);
	let repositoryPickerOpen = $state(false);
	function toggleSidebar() {
		repositoryPickerOpen = false;
		sidebar.current = { ...sidebar.current, open: !sidebar.current.open };
	}
	setTitleBarLead(() => (sidebar.current.open ? undefined : lead));
	// Leave room for the conversation and its tools in smaller windows.
	const maxWidth = $derived(Math.max(240, Math.min(720, (innerWidth.current ?? 1320) - 600)));
	const clampWidth = (width: number) => Math.round(Math.min(maxWidth, Math.max(240, width)));
	/** What the sidebar has folded away: also what the previous and next workspace skip. */
	const folded = persisted<string[]>('geordi:folded', []);
	/** The repository the sidebar shows alone, if any: also all the previous and next workspace go to. */
	const focus = persisted<string | null>('geordi:focus', null);

	/** Whether the sidebar shows only the active workspaces, leaving out the inactive ones. */
	const activeOnly = persisted('geordi:active-only', true);

	/** Goes to the workspace above (-1) or below (1) the one on screen, as the sidebar lists them. */
	function stepWorkspace(step: 1 | -1 | 'unread') {
		const all = nav.current;
		if (!all) return;
		// the workspaces, as the outline shows them (FDR-017)
		const order = outlineRows(all.items, all.workspaces, {
			activeOnly: activeOnly.current,
			focus: focus.current,
			folded: folded.current,
			viewed
		}).flatMap(({ workspace: entry }) =>
			entry.workspace && !entry.done && (step === 'unread' || !entry.project) ? [entry] : []
		);
		const to =
			step === 'unread' ? nextUnread(order, viewed, unread) : stepThrough(order, viewed, step);
		if (to) void goto(resolve('/workspaces/[id]', { id: to.id }));
	}

	/** Begins a workspace, on the start page; `choosing` its repository first. */
	function newWorkspace(choosing = false) {
		if (choosing) pickRepo();
		if (page.url.pathname !== resolve('/')) void goto(resolve('/'));
	}

	// Every workspace to go to, and what can be done from anywhere, found by typing a few letters.
	let commands = $state(false);
	let adding = $state<AddRepository>();
	/**
	 * The workspaces as recently active as they were when the palette opened: kept while it
	 * is open, so that agents at work don't reorder the list under the keyboard.
	 */
	let recency = $state.raw<string[]>([]);
	$effect.pre(() => {
		if (!commands) return;
		recency = untrack(() =>
			[...(nav.current?.workspaces ?? [])]
				.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
				.map(({ id }) => id)
		);
	});
	const commandList = $derived(
		globalCommands({
			nav: nav.current,
			viewed,
			recency,
			anyUnread: unread.size > 0,
			sidebarOpen: sidebar.current.open,
			wide: (innerWidth.current ?? 0) >= 768,
			activeOnly: activeOnly.current,
			focus: focus.current,
			theme: theme.current,
			sections,
			newWorkspace,
			open: (id) => void goto(resolve('/workspaces/[id]', { id })),
			step: stepWorkspace,
			addRepository: () => adding?.start(),
			openArchive: () => void goto(resolve('/archive')),
			openSettings,
			toggleSidebar,
			filterRepositories: () => {
				if (!sidebar.current.open) toggleSidebar();
				repositoryPickerOpen = true;
			},
			toggleActiveOnly: () => (activeOnly.current = !activeOnly.current),
			setFocus: (repo) => {
				focus.current = repo;
				// showing a repository alone is only seen in the sidebar
				if (repo && !sidebar.current.open) toggleSidebar();
			},
			setTheme: (next) => (theme.current = next)
		})
	);

	function resize(event: PointerEvent & { currentTarget: HTMLElement }) {
		const handle = event.currentTarget;
		event.preventDefault();
		handle.setPointerCapture(event.pointerId);
		const move = ({ clientX }: PointerEvent) =>
			(sidebar.current = { ...sidebar.current, width: clampWidth(clientX) });
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), {
			once: true
		});
	}

	function nudge(event: KeyboardEvent) {
		const step = { ArrowLeft: -16, ArrowRight: 16 }[event.key];
		if (!step) return;
		event.preventDefault();
		sidebar.current = {
			...sidebar.current,
			width: clampWidth(clampWidth(sidebar.current.width) + step)
		};
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Geordi</title>
</svelte:head>

<!-- sending an agent off to work is when to ask for leave to tell when it is done -->
<svelte:window
	onsubmitcapture={() => ask()}
	onkeydown={(event) => {
		if (!pressed(event, 'commands')) return void runShortcut(event, commandList);
		event.preventDefault();
		if (!event.repeat) commands = !commands;
	}}
/>
<!-- the desktop app's "Settings…" menu item asks for them this way -->
<svelte:document
	{@attach (document) => {
		const open = () => openSettings();
		document.addEventListener('geordi:settings', open);
		return () => document.removeEventListener('geordi:settings', open);
	}}
/>

<!-- Reserve the toggle's place in the page header when the sidebar is hidden. -->
{#snippet lead()}
	<div class="hidden shrink-0 items-center pl-8 md:flex mac:pl-25">
		<ConnectionIndicator {lost} />
	</div>
{/snippet}

{#snippet logo()}
	<a href={resolve('/')} class="flex min-w-0 items-center gap-2.5" aria-label="Geordi home">
		<Logo />
		<span class="truncate heading">Geordi</span>
	</a>
{/snippet}

<div class="flex min-h-dvh">
	<SidebarToggle open={sidebar.current.open} onclick={toggleSidebar} />
	{#if sidebar.current.open || visibleSidebar.current > 0}
		{@const width = clampWidth(sidebar.current.width)}
		<aside
			class="sticky top-0 hidden h-dvh shrink-0 flex-col bg-frame md:flex"
			style:width="{width}px"
			style:margin-left="{(visibleSidebar.current - 1) * width}px"
			inert={!sidebar.current.open}
		>
			<div class="flex h-14 shrink-0 items-center pl-16 window-drag">
				<span class="contents desktop:hidden">{@render logo()}</span>
			</div>

			<!-- a sheet like the ones beside it: what there is to work on, and the settings below -->
			<div class="mb-2 ml-2 flex min-h-0 flex-1">
				<Sidebar
					{lost}
					nav={nav.current}
					path={page.url.pathname}
					{folded}
					{focus}
					bind:activeOnly={() => activeOnly.current, (value) => (activeOnly.current = value)}
					bind:repositoryPickerOpen
				/>
			</div>

			<!-- A focusable separator is a widget (a splitter), which the a11y check doesn't know. -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
			<div
				role="separator"
				tabindex="0"
				aria-orientation="vertical"
				aria-label="Resize the sidebar"
				aria-valuemin={240}
				aria-valuemax={maxWidth}
				aria-valuenow={clampWidth(sidebar.current.width)}
				onpointerdown={resize}
				onkeydown={nudge}
				class="absolute top-14 -right-2 bottom-2 z-10 w-2 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:left-1/2 after:w-px focus-visible:after:bg-accent"
			></div>
		</aside>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		<header class="flex h-14 items-center gap-4 bg-frame px-4 md:hidden">
			{@render logo()}
			<ConnectionIndicator {lost} />
			<Button
				variant="ghost"
				icon="icon-[lucide--settings]"
				label="Settings"
				class="ml-auto"
				onclick={() => openSettings()}
			/>
		</header>
		{@render children()}
	</div>
</div>

<ContextMenu />
<CommandPalette
	bind:open={commands}
	label="Go to a workspace, or do something"
	placeholder="Workspaces and commands…"
	items={commandList}
/>
<AddRepository
	bind:this={adding}
	onadded={({ id }) => goto(resolve(`/?repo=${encodeURIComponent(id)}`))}
/>
<ArchiveConfirm asking={archiving.asking} />

<ReleaseConfirm asking={releaseReview.asking} />
