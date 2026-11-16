<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import HistoryButtons from '#lib/components/HistoryButtons.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Settings from '#lib/components/Settings.svelte';
	import { openSettings } from '#lib/components/settings.svelte.ts';
	import { modifierKey, settingsShortcut, sidebarToggle } from '#lib/keys.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import { archive } from '#lib/components/workspace/archive.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import ContextMenu from '#lib/ui/ContextMenu.svelte';
	import { contextMenu, type MenuItem } from '#lib/ui/menu.svelte.ts';
	import Spinner from '#lib/ui/Spinner.svelte';
	import { setTitleBarLead } from '#lib/ui/TitleBar.svelte';
	import { getNavigation } from './nav.remote';
	import { stopAgent } from './workspaces.remote';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const nav = getNavigation();

	type Item = NonNullable<typeof nav.current>['workspaces'][number];

	/**
	 * Workspaces as a tree of who started what (FDR-002): the ones people started at the top,
	 * the ones their agents started beneath them.
	 */
	const tree = $derived.by(() => {
		const all = nav.current?.workspaces ?? [];
		const ids = new Set(all.map((workspace) => workspace.id));
		const children = Object.groupBy(all, (workspace: Item) =>
			ids.has(workspace.parentId ?? '') ? workspace.parentId! : ''
		);
		const of = (id: string | null) => children[id ?? ''] ?? [];
		/** A workspace counts as working while anything beneath it is. */
		const working = (workspace: Item): boolean =>
			workspace.status === 'running' || of(workspace.id).some(working);
		return { of, working };
	});

	/** Archives a workspace from the sidebar, wherever we are. */
	async function archiveFromHere(workspace: Item) {
		const href = resolve('/workspaces/[id]', { id: workspace.id });
		const here = page.url.pathname === href;
		// Refused (work would be lost): the workspace's page says why, and what to do.
		if (!(await archive(workspace.id))) await goto(href);
		else if (here) await goto(resolve('/'));
	}

	/** What can be done with a workspace from the sidebar, without opening it. */
	function workspaceMenu(workspace: Item): MenuItem[] {
		const href = resolve('/workspaces/[id]', { id: workspace.id });
		const running = workspace.status === 'running';
		// archiving takes the workspaces its agent started along: none of them may be working
		const working = tree.working(workspace);
		return [
			{
				label: 'Open in new tab',
				icon: 'icon-[lucide--arrow-up-right]',
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
				label: 'Stop agent',
				icon: 'icon-[lucide--square]',
				disabled: !running,
				onselect: () => stopAgent(workspace.id)
			},
			{
				label: 'Archive',
				icon: 'icon-[lucide--archive]',
				danger: true,
				disabled: working,
				onselect: () => archiveFromHere(workspace)
			}
		];
	}

	// The sidebar can be hidden and made wider or narrower; both are remembered here.
	const sidebar = persisted('geordi:nav', { open: true, width: 256 });
	const toggleSidebar = () =>
		(sidebar.current = { ...sidebar.current, open: !sidebar.current.open });
	setTitleBarLead(() => (sidebar.current.open ? undefined : lead));
	const clampWidth = (width: number) => Math.round(Math.min(480, Math.max(200, width)));
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
		sidebar.current = { ...sidebar.current, width: clampWidth(sidebar.current.width + step) };
	}

	const repoName = (id: string) => nav.current?.repos.find((repo) => repo.id === id)?.name;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Geordi</title>
</svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (settingsShortcut(event)) {
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

<!-- The desktop app's window has no title bar: its top edge is what it is dragged by. -->
<div class="fixed inset-x-0 top-0 hidden h-14 window-drag desktop:block"></div>

<div class="flex min-h-dvh">
	{#if sidebar.current.open}
		<aside
			class="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-sidebar md:flex"
			style:width="{sidebar.current.width}px"
		>
			<!--
				The sidebar's part of the title bar. In the desktop app the window's buttons are on
				its left, so the logo makes way and the toggle moves up beside them.
			-->
			<div class="flex h-14 shrink-0 items-center gap-1 pr-2.5 pl-4 desktop:pl-22">
				<span class="contents desktop:hidden">{@render logo()}</span>
				<span class="flex-1 desktop:order-2"></span>
				<span class="flex desktop:order-1">{@render toggle('icon-[lucide--panel-left-close]')}</span
				>
				<span class="hidden items-center gap-1 desktop:order-3 desktop:flex"
					><HistoryButtons /></span
				>
			</div>

			<nav class="flex-1 space-y-6 overflow-y-auto px-2.5 pb-4" aria-label="Main">
				<div class="space-y-0.5">
					{@render link(
						resolve('/'),
						'icon-[lucide--layout-grid]',
						'Overview',
						page.url.pathname === '/'
					)}
					{@render link(
						resolve('/workspaces/new'),
						'icon-[lucide--plus]',
						'New workspace',
						page.url.pathname === '/workspaces/new'
					)}
				</div>

				{#if tree.of(null).length > 0}
					<div>
						<p class="px-2.5 pb-1 label">Workspaces</p>
						{@render workspaces(null)}
					</div>
				{/if}
			</nav>

			<div class="border-t border-line p-2.5">
				<button
					type="button"
					class="item w-full gap-2.5 px-2.5 py-1.5"
					onclick={() => openSettings()}
				>
					<span class="icon-[lucide--settings] size-4 shrink-0"></span>
					Settings
					<kbd class="ml-auto font-sans text-xs text-muted/80">{settingsHint}</kbd>
				</button>
			</div>

			<!-- A focusable separator is a widget (a splitter), which the a11y check doesn't know. -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
			<div
				role="separator"
				tabindex="0"
				aria-orientation="vertical"
				aria-label="Resize the sidebar"
				aria-valuenow={sidebar.current.width}
				onpointerdown={resize}
				onkeydown={nudge}
				class="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none transition-colors select-none after:absolute after:inset-y-0 after:left-1/2 after:w-px hover:after:bg-accent focus-visible:after:bg-accent"
			></div>
		</aside>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		<header class="flex h-14 items-center gap-4 border-b border-line bg-sidebar px-4 md:hidden">
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

{#snippet workspaces(parent: string | null)}
	<ul class={['space-y-px', parent && 'ml-3.5 border-l border-line pl-1.5']}>
		{#each tree.of(parent) as workspace (workspace.id)}
			{@const current = page.url.pathname === `/workspaces/${workspace.id}`}
			{@const working = tree.working(workspace)}
			<li>
				<!-- the whole row is the item: the link, and what appears beside it on hover -->
				<div
					class={['group item pr-1', current && 'item-active']}
					{@attach contextMenu(() => workspaceMenu(workspace))}
				>
					<a
						href={resolve('/workspaces/[id]', { id: workspace.id })}
						class="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1.5 pl-2.5"
						aria-current={current ? 'page' : undefined}
					>
						{#if working}<Spinner />{:else}<span class="dot"></span>{/if}
						<span class="min-w-0 flex-1 truncate">{workspace.title}</span>
						{#if !parent}
							<!-- makes way for the archive button, where there is one -->
							<span
								class={[
									'max-w-20 shrink-0 truncate text-xs text-muted/80',
									!working && 'group-focus-within:hidden group-hover:hidden'
								]}
							>
								{repoName(workspace.repoId)}
							</span>
						{/if}
					</a>
					{#if !working}
						<button
							type="button"
							class="hidden size-6 shrink-0 place-items-center rounded-control text-muted group-focus-within:grid group-hover:grid hover:bg-sunken hover:text-ink"
							title="Archive workspace"
							aria-label="Archive {workspace.title}"
							onclick={() => archiveFromHere(workspace)}
						>
							<span class="icon-[lucide--archive] size-3.5"></span>
						</button>
					{/if}
				</div>
				{#if tree.of(workspace.id).length > 0}
					{@render workspaces(workspace.id)}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet link(href: string, icon: string, label: string, current: boolean, working = 0)}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass resolve()d hrefs -->
	<a
		{href}
		class={['item gap-2.5 px-2.5 py-1.5', current && 'item-active font-medium']}
		aria-current={current ? 'page' : undefined}
	>
		<span class={['size-4 shrink-0', icon]}></span>
		<span class="truncate">{label}</span>
		{#if working > 0}
			<span class="ml-auto" title="{working} working"><Badge tone="accent">{working}</Badge></span>
		{/if}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}
