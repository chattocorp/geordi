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
	import { byRepository } from '#lib/family.ts';
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

	/** The workspaces by repository, each agent-started one after the one that started it. */
	const listed = $derived(byRepository(nav.current?.workspaces ?? []));
	/** A workspace counts as working, for archiving, while anything its agent started is. */
	const working = (workspace: Item): boolean =>
		workspace.status === 'running' ||
		(nav.current?.workspaces ?? []).some(
			(other) => other.parentId === workspace.id && working(other)
		);
	/** The parent of the workspace the pointer is on: lit up, to show who it belongs to. */
	let pointedAt = $state<string | null>(null);

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
		const busy = working(workspace);
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
				disabled: busy,
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

<!--
	The desktop app's window has no title bar: its top edge is what it is dragged by. Behind
	everything (`-z-10`): on top, it would take the clicks meant for what is in that row.
-->
<div class="fixed inset-x-0 top-0 -z-10 hidden h-14 window-drag desktop:block"></div>

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
			<div
				class="flex h-14 shrink-0 items-center gap-1 border-b border-line pr-2.5 pl-4 desktop:pl-22"
			>
				<span class="contents desktop:hidden">{@render logo()}</span>
				<span class="flex-1 desktop:order-2"></span>
				<span class="flex desktop:order-1">{@render toggle('icon-[lucide--panel-left-close]')}</span
				>
				<span class="hidden items-center gap-1 desktop:order-3 desktop:flex"
					><HistoryButtons /></span
				>
			</div>

			<nav class="flex-1 space-y-6 overflow-y-auto px-2.5 py-3" aria-label="Main">
				<div class="space-y-0.5">
					{@render link(
						resolve('/'),
						'icon-[lucide--plus]',
						'New workspace',
						page.url.pathname === '/'
					)}
				</div>

				<!-- every repository, also one nothing is going on in: its name is the way to its page -->
				{#each (await nav).repos as repo (repo.id)}
					<div>
						<a
							href={resolve('/repos/[id]', { id: repo.id })}
							class="block truncate px-2.5 pb-1 label hover:text-ink"
						>
							{repo.name}
						</a>
						<ul class="space-y-px">
							{#each listed.get(repo.id) ?? [] as { workspace, parent } (workspace.id)}
								{@render row(workspace, parent)}
							{/each}
						</ul>
					</div>
				{/each}
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

{#snippet row(workspace: Item, parent: Item | null)}
	{@const current = page.url.pathname === `/workspaces/${workspace.id}`}
	{@const busy = working(workspace)}
	<li>
		<!-- the whole row is the item: the link, and what appears beside it on hover -->
		<div
			class={[
				'group item pr-1',
				current && 'item-active',
				pointedAt === workspace.id && 'bg-surface/60 text-ink'
			]}
			{@attach contextMenu(() => workspaceMenu(workspace))}
		>
			<a
				href={resolve('/workspaces/[id]', { id: workspace.id })}
				class="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1.5 pl-2.5"
				aria-current={current ? 'page' : undefined}
				title={parent ? `Started by the agent in "${parent.title}"` : undefined}
				onpointerenter={() => (pointedAt = parent?.id ?? null)}
				onpointerleave={() => (pointedAt = null)}
				onfocus={() => (pointedAt = parent?.id ?? null)}
				onblur={() => (pointedAt = null)}
			>
				{#if workspace.status === 'running'}<Spinner />{:else}<span class="dot"></span>{/if}
				{#if workspace.parentId}
					<!-- started by an agent: the one above it, where that is still around -->
					<span class="icon-[lucide--corner-down-right] size-3.5 shrink-0 text-muted/80"></span>
				{/if}
				<span class="min-w-0 flex-1 truncate">{workspace.title}</span>
			</a>
			{#if !busy}
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
	</li>
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
