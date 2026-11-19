<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { untrack } from 'svelte';
	import { innerWidth } from 'svelte/reactivity/window';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ConnectionIndicator from '#lib/components/ConnectionIndicator.svelte';
	import HistoryButtons from '#lib/components/HistoryButtons.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import { openSettings } from '#lib/components/settings.svelte.ts';
	import { inSidebarOrder, stepThrough } from '#lib/family.ts';
	import { hint, pressed } from '#lib/keys.ts';
	import { ask, badge, isLooking, seen, watch } from '#lib/notifications.svelte.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import { archiving } from '#lib/components/workspace/archive.svelte.ts';
	import ArchiveConfirm from '#lib/components/workspace/ArchiveConfirm.svelte';
	import { pickRepo } from '#lib/components/workspace/NewWorkspace.svelte';
	import Button from '#lib/ui/Button.svelte';
	import ContextMenu from '#lib/ui/ContextMenu.svelte';
	import { setTitleBarLead } from '#lib/ui/TitleBar.svelte';
	import { connect, connection, follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	// everything live on the page comes over one connection: this is where it starts
	// svelte-ignore state_referenced_locally
	connect(data.live);
	const lost = $derived(connection.state === 'lost');
	const nav = follow<Navigation>('navigation');

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

	// The sidebar can be hidden and made wider or narrower; both are remembered here.
	const sidebar = persisted('geordi:nav', { open: true, width: 256 });
	const toggleSidebar = () =>
		(sidebar.current = { ...sidebar.current, open: !sidebar.current.open });
	setTitleBarLead(() => (sidebar.current.open ? undefined : lead));
	// Leave room for the conversation and its tools in smaller windows.
	const maxWidth = $derived(Math.max(240, Math.min(720, (innerWidth.current ?? 1320) - 600)));
	const clampWidth = (width: number) => Math.round(Math.min(maxWidth, Math.max(240, width)));
	const toggleHint = `Toggle the sidebar (${hint('toggleSidebar')})`;
	/** What the sidebar has folded away: also what the previous and next workspace skip. */
	const folded = persisted<string[]>('geordi:folded', []);

	/** Goes to the workspace above (-1) or below (1) the one on screen, as the sidebar lists them. */
	function stepWorkspace(step: 1 | -1) {
		const all = nav.current;
		if (!all) return;
		const order = inSidebarOrder(
			all.workspaces,
			all.repos.map(({ id }) => id),
			folded.current
		);
		const to = stepThrough(order, viewed, step);
		if (to) void goto(resolve('/workspaces/[id]', { id: to.id }));
	}

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
		const newIn = pressed(event, 'newWorkspaceIn');
		if (newIn || pressed(event, 'newWorkspace')) {
			event.preventDefault();
			if (event.repeat) return;
			if (newIn) pickRepo();
			if (page.url.pathname !== resolve('/')) void goto(resolve('/'));
		} else if (pressed(event, 'previousWorkspace') || pressed(event, 'nextWorkspace')) {
			event.preventDefault();
			stepWorkspace(pressed(event, 'nextWorkspace') ? 1 : -1);
		} else if (pressed(event, 'settings')) {
			event.preventDefault();
			openSettings();
		} else if (pressed(event, 'toggleSidebar')) {
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
	<div class="hidden items-center gap-1 md:flex mac:pl-17">
		{@render toggle('icon-[lucide--panel-left-open]')}
		<span class="hidden items-center gap-1 desktop:flex"><HistoryButtons /></span>
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
	{#if sidebar.current.open}
		<aside
			class="sticky top-0 hidden h-dvh shrink-0 flex-col bg-frame md:flex"
			style:width="{clampWidth(sidebar.current.width)}px"
		>
			<!--
				The sidebar's part of the title bar. On macOS the window's buttons are on its left, so
				the logo makes way and the toggle moves up beside them.
			-->
			<div class="flex h-14 shrink-0 items-center gap-1 pr-2.5 pl-4 window-drag mac:pl-22">
				<span class="contents desktop:hidden">{@render logo()}</span>
				<span class="flex-1 desktop:order-2"></span>
				<span class="flex desktop:order-1">{@render toggle('icon-[lucide--panel-left-close]')}</span
				>
				<span class="hidden items-center gap-1 desktop:order-3 desktop:flex"
					><HistoryButtons /></span
				>
			</div>

			<!-- a sheet like the ones beside it: what there is to work on, and the settings below -->
			<div class="mb-2 ml-2 flex min-h-0 flex-1">
				<Sidebar {lost} nav={nav.current} path={page.url.pathname} {folded} />
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
<ArchiveConfirm asking={archiving.asking} />
