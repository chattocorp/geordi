<script lang="ts">
	import { pendingPullAction } from '#lib/components/workspace/review.svelte.ts';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { untrack } from 'svelte';
	import { innerWidth } from 'svelte/reactivity/window';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import HistoryButtons from '#lib/components/HistoryButtons.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import Settings from '#lib/components/Settings.svelte';
	import { openSettings } from '#lib/components/settings.svelte.ts';
	import { byRepository } from '#lib/family.ts';
	import { lanes } from '#lib/overview.ts';
	import {
		modifierKey,
		newWorkspaceShortcut,
		repoShortcut,
		settingsShortcut,
		sidebarToggle
	} from '#lib/keys.ts';
	import { ask, badge, isLooking, seen, unread, watch } from '#lib/notifications.svelte.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import { archiving, beingArchived } from '#lib/components/workspace/archive.svelte.ts';
	import ArchiveConfirm from '#lib/components/workspace/ArchiveConfirm.svelte';
	import { pickRepo } from '#lib/components/workspace/NewWorkspace.svelte';
	import Button from '#lib/ui/Button.svelte';
	import ContextMenu from '#lib/ui/ContextMenu.svelte';
	import { contextMenu, type MenuItem, type MenuTone } from '#lib/ui/menu.svelte.ts';
	import StandingIcon from '#lib/components/StandingIcon.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import { setTitleBarLead } from '#lib/ui/TitleBar.svelte';
	import { connect, follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import type { WorkspaceStanding } from '#lib/actions.ts';
	import {
		actFromAfar,
		archiveFromAfar,
		continueFromAfar
	} from '#lib/components/workspace/afar.svelte.ts';
	import { stopAgent } from './workspaces.remote';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	// everything live on the page comes over one connection: this is where it starts
	// svelte-ignore state_referenced_locally
	connect(data.live);
	const nav = follow<Navigation>('navigation');

	type Item = Navigation['workspaces'][number];

	/** The workspaces by repository, each agent-started one after the one that started it. */
	const listed = $derived(byRepository(nav.current?.workspaces ?? []));
	const sidebarRepos = $derived(nav.current?.repos.filter((repo) => repo.workspaceCount > 0) ?? []);
	/** How many workspaces wait for the person: counted beside the overview. */
	const needYou = $derived(lanes(nav.current?.workspaces ?? [], unread).attention.length);
	/** A workspace counts as working, for archiving, while anything its agent started is. */
	const working = (workspace: Item): boolean =>
		workspace.working ||
		(nav.current?.workspaces ?? []).some(
			(other) => other.parentId === workspace.id && working(other)
		);
	/** The workspace on screen, if any. */
	const viewed = $derived(page.url.pathname.match(/^\/workspaces\/([^/]+)$/)?.[1] ?? null);

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

	/** The parent of the workspace the pointer is on: lit up, to show who it belongs to. */
	let pointedAt = $state<string | null>(null);

	/** The colour of what to do next, from how the workspace stands: as in its ribbon. */
	const actionTone = (standing: WorkspaceStanding | null): MenuTone =>
		standing?.tone === 'ok' || standing?.tone === 'merged' ? standing.tone : 'accent';

	/** What can be done with a workspace from the sidebar, without opening it. */
	function workspaceMenu(workspace: Item): MenuItem[] {
		const href = resolve('/workspaces/[id]', { id: workspace.id });
		const running = workspace.status === 'running';
		// archiving takes the workspaces its agent started along: none of them may be working
		const busy = working(workspace);
		// the menu has these already, below
		const next = workspace.actions.filter(({ id }) => id !== 'continue' && id !== 'archive');
		return [
			...next.map((action) => ({
				label: action.label,
				icon: action.icon,
				tone: actionTone(workspace.standing),
				disabled: !!action.pullNumber && pendingPullAction.has(workspace.id),
				onselect: () => actFromAfar(workspace, action)
			})),
			...(next.length > 0 ? ['separator' as const] : []),
			{
				label: 'Open in new tab',
				icon: 'icon-[lucide--external-link]',
				onselect: () => window.open(href, '_blank', 'noopener')
			},
			{
				label: 'Copy ID',
				icon: 'icon-[lucide--hash]',
				onselect: () => navigator.clipboard.writeText(workspace.id)
			},
			{
				label: 'Copy branch name',
				icon: 'icon-[lucide--git-branch]',
				disabled: !workspace.branch,
				onselect: () => navigator.clipboard.writeText(workspace.branch ?? '')
			},
			'separator',
			{
				label: 'Continue on a new branch',
				icon: 'icon-[lucide--git-branch-plus]',
				disabled: busy,
				onselect: () => continueFromAfar(workspace)
			},
			{
				label: 'Stop agent',
				icon: 'icon-[lucide--square]',
				disabled: !running,
				onselect: () => stopAgent(workspace.id)
			},
			{
				label: 'Archive',
				icon: 'icon-[lucide--archive]',
				tone: 'merged',
				disabled: beingArchived.has(workspace.id),
				onselect: () => archiveFromAfar(workspace)
			}
		];
	}

	// The sidebar can be hidden and made wider or narrower; both are remembered here.
	const sidebar = persisted('geordi:nav', { open: true, width: 256 });
	/** The repositories whose workspaces are folded away under their name. */
	const folded = persisted<string[]>('geordi:folded', []);
	const toggleFolded = (id: string) =>
		(folded.current = folded.current.includes(id)
			? folded.current.filter((other) => other !== id)
			: [...folded.current, id]);
	const toggleSidebar = () =>
		(sidebar.current = { ...sidebar.current, open: !sidebar.current.open });
	setTitleBarLead(() => (sidebar.current.open ? undefined : lead));
	// Leave room for the conversation and its tools in smaller windows.
	const maxWidth = $derived(Math.max(240, Math.min(720, (innerWidth.current ?? 1320) - 600)));
	const clampWidth = (width: number) => Math.round(Math.min(maxWidth, Math.max(240, width)));
	const toggleHint = `Toggle the sidebar (${modifierKey()}B)`;
	const settingsHint = `${modifierKey()},`;

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
		if (newWorkspaceShortcut(event) || repoShortcut(event)) {
			event.preventDefault();
			if (event.repeat) return;
			if (repoShortcut(event)) pickRepo();
			if (page.url.pathname !== resolve('/')) void goto(resolve('/'));
		} else if (settingsShortcut(event)) {
			event.preventDefault();
			openSettings();
		} else if (sidebarToggle(event) === 'left') {
			event.preventDefault();
			toggleSidebar();
		}
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

{#snippet toggle(icon: string)}
	<Button variant="ghost" {icon} label={toggleHint} onclick={toggleSidebar} />
{/snippet}

<!-- With the sidebar hidden, its part of the title bar is where every page's bar starts. -->
{#snippet lead()}
	<div class="hidden items-center gap-1 md:flex desktop:pl-17">
		{@render toggle('icon-[lucide--panel-left-open]')}
		<span class="hidden items-center gap-1 desktop:flex"><HistoryButtons /></span>
	</div>
{/snippet}

{#snippet logo()}
	<a href={resolve('/')} class="flex min-w-0 items-center gap-2.5" aria-label="Geordi home">
		<Logo />
		<span class="truncate heading">Geordi</span>
	</a>
{/snippet}

<div class="flex min-h-dvh">
	{#if sidebar.current.open}
		<aside
			class="sticky top-0 hidden h-dvh shrink-0 flex-col bg-frame md:flex"
			style:width="{clampWidth(sidebar.current.width)}px"
		>
			<!--
				The sidebar's part of the title bar. In the desktop app the window's buttons are on
				its left, so the logo makes way and the toggle moves up beside them.
			-->
			<div class="flex h-14 shrink-0 items-center gap-1 pr-2.5 pl-4 window-drag desktop:pl-22">
				<span class="contents desktop:hidden">{@render logo()}</span>
				<span class="flex-1 desktop:order-2"></span>
				<span class="flex desktop:order-1">{@render toggle('icon-[lucide--panel-left-close]')}</span
				>
				<span class="hidden items-center gap-1 desktop:order-3 desktop:flex"
					><HistoryButtons /></span
				>
			</div>

			<!-- a sheet like the ones beside it: what there is to work on, and the settings below -->
			<div class="mb-2 ml-2 flex min-h-0 flex-1 flex-col sheet-quiet">
				<nav class="flex-1 space-y-6 overflow-y-auto p-2" aria-label="Main">
					<div class="space-y-0.5">
						{@render link(
							resolve('/overview'),
							'icon-[lucide--layout-list]',
							'Overview',
							page.url.pathname === '/overview',
							needYou
						)}
						{@render link(
							resolve('/'),
							'icon-[lucide--plus]',
							'New workspace',
							page.url.pathname === '/'
						)}
					</div>

					<div class="space-y-4">
						{#each sidebarRepos as repo (repo.id)}
							{@const rows = listed.get(repo.id) ?? []}
							{@const isFolded = folded.current.includes(repo.id)}
							<div>
								<!--
								A label for what is under it: its picture, its name (quiet, by its colour: the
								workspaces are what is read here), and the way to start something in it. What is
								under it lines up with it: icon under picture, title under name.
							-->
								<div class="group flex h-7 items-center pr-1.5">
									<button
										type="button"
										class="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-2 pl-1.5 text-left text-sm font-semibold text-muted/50 hover:text-ink"
										aria-expanded={!isFolded}
										onclick={() => toggleFolded(repo.id)}
									>
										<RepoIcon id={repo.id} />
										<span class="truncate">{repo.name}</span>
										{#if isFolded}
											<span class="shrink-0 font-normal tabular-nums">{rows.length}</span>
										{/if}
									</button>
									<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved, plus which repository -->
									<a
										href="{resolve('/')}?repo={repo.id}"
										class="invisible grid size-6 shrink-0 place-items-center rounded-control text-muted group-hover:visible group-has-focus-visible:visible hover:bg-sunken hover:text-ink"
										title="New workspace in {repo.name}"
										aria-label="New workspace in {repo.name}"
									>
										<span class="icon-[lucide--plus] size-4"></span>
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								</div>
								{#if !isFolded}
									<ul class="space-y-px">
										{#each rows as { workspace, parent, depth } (workspace.id)}
											{@render row(workspace, parent, depth)}
										{/each}
									</ul>
								{/if}
							</div>
						{/each}
					</div>
				</nav>

				<div class="p-2">
					<button
						type="button"
						class="item w-full gap-2.5 px-2.5 py-1.5 text-base"
						onclick={() => openSettings()}
					>
						<span class="icon-[lucide--settings] size-4 shrink-0"></span>
						Settings
						<kbd class="ml-auto font-sans text-xs text-muted/80">{settingsHint}</kbd>
					</button>
				</div>
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
				class="absolute top-14 -right-2 bottom-2 z-10 w-2 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:transition-colors hover:after:bg-muted/40 focus-visible:after:bg-accent"
			></div>
		</aside>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		<header class="flex h-14 items-center gap-4 bg-frame px-4 md:hidden">
			{@render logo()}
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
<Settings />
<ArchiveConfirm asking={archiving.asking} />

{#snippet row(workspace: Item, parent: Item | null, depth: number)}
	{@const current = page.url.pathname === `/workspaces/${workspace.id}`}
	{@const busy = working(workspace)}
	{@const leaving = beingArchived.has(workspace.id)}
	<!-- Routine publishing steps only need to appear inside the workspace. -->
	{@const standing =
		leaving ||
		workspace.standing?.tone === 'accent' ||
		workspace.standing?.label === 'No pull request'
			? null
			: workspace.standing}
	{@const archivable = !busy && !leaving}
	<!-- one started by an agent sits a little in from the one that started it -->
	<li style:margin-inline-start="calc(var(--spacing) * {3 * depth})">
		<!-- the whole row is the item: the link, and what appears beside it on hover -->
		<div
			class={[
				'group item pr-1 text-base',
				// on its way out: it shows, and there is nothing more to do with it
				leaving && 'pointer-events-none opacity-60',
				current && 'item-active',
				// it came to rest out of sight, and they haven't looked since
				unread.has(workspace.id) && 'font-semibold text-ink',
				pointedAt === workspace.id && 'bg-surface/60 text-ink'
			]}
			{@attach contextMenu(() => workspaceMenu(workspace))}
		>
			<a
				href={resolve('/workspaces/[id]', { id: workspace.id })}
				class="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1.5 pl-1.5"
				aria-current={current ? 'page' : undefined}
				title={parent ? `Started by the agent in "${parent.title}"` : undefined}
				onpointerenter={() => (pointedAt = parent?.id ?? null)}
				onpointerleave={() => (pointedAt = null)}
				onfocus={() => (pointedAt = parent?.id ?? null)}
				onblur={() => (pointedAt = null)}
			>
				<!-- what it is, or is doing, in one place: every title starts on the same edge -->
				<!-- as wide as the repository's picture above, and right under it -->
				<span class="grid size-5 shrink-0 place-items-center text-muted/80">
					{#if leaving}
						<Spinner label="Archiving" />
					{:else if workspace.outcome === 'asking'}
						<!-- an agent there waits for the person's answer -->
						<span class="icon-[lucide--message-circle-question] size-4 text-accent-ink"></span>
					{:else if workspace.working}
						<!-- its agent, or one working alongside it -->
						<Spinner />
					{:else if workspace.parentId}
						<!-- started by an agent: the one above it, where that is still around -->
						<span class="icon-[lucide--corner-down-right] size-4"></span>
					{:else}
						<span class="icon-[lucide--git-branch] size-4"></span>
					{/if}
				</span>
				<span class="min-w-0 flex-1 truncate">{workspace.title}</span>
			</a>
			<!--
				At its end: how its work stands, at a glance. Pointed at, that makes way for what
				can be done with it; the two share one place, so that nothing moves.
			-->
			<span class="grid size-6 shrink-0 place-items-center">
				{#if standing}
					<span
						class={[
							'col-start-1 row-start-1',
							archivable && 'group-hover:invisible group-has-focus-visible:invisible'
						]}
					>
						<StandingIcon {standing} />
					</span>
				{/if}
				{#if archivable}
					<button
						type="button"
						class={[
							'invisible col-start-1 row-start-1 grid size-6 place-items-center rounded-control group-hover:visible group-has-focus-visible:visible hover:bg-sunken',
							standing?.tone === 'merged' ? 'text-merged' : 'text-muted hover:text-ink'
						]}
						title="Archive workspace"
						aria-label="Archive {workspace.title}"
						onclick={() => archiveFromAfar(workspace)}
					>
						<span class="icon-[lucide--archive] size-3.5"></span>
					</button>
				{/if}
			</span>
		</div>
	</li>
{/snippet}

{#snippet link(href: string, icon: string, label: string, current: boolean, needYou = 0)}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass resolve()d hrefs -->
	<a
		{href}
		class={['item gap-2.5 px-2.5 py-1.5 text-base', current && 'item-active font-medium']}
		aria-current={current ? 'page' : undefined}
	>
		<span class={['size-4 shrink-0', icon]}></span>
		<span class="truncate">{label}</span>
		{#if needYou > 0}
			<span class="ml-auto" title="{needYou} need you"><Badge tone="accent">{needYou}</Badge></span>
		{/if}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}
