<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Logo from '#lib/components/Logo.svelte';
	import { modifierKey, sidebarToggle } from '#lib/keys.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import ThemeToggle from '#lib/ui/ThemeToggle.svelte';
	import { getNavigation } from './nav.remote';
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

	// The sidebar can be hidden and made wider or narrower; both are remembered here.
	const sidebar = persisted('geordi:nav', { open: true, width: 256 });
	const toggleSidebar = () =>
		(sidebar.current = { ...sidebar.current, open: !sidebar.current.open });
	const clampWidth = (width: number) => Math.round(Math.min(480, Math.max(200, width)));
	const toggleHint = `Toggle the sidebar (${modifierKey()}B)`;

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
		if (sidebarToggle(event) !== 'left') return;
		event.preventDefault();
		toggleSidebar();
	}}
/>

{#snippet logo()}
	<a href={resolve('/')} class="flex items-center gap-2.5" aria-label="Geordi home">
		<Logo />
		<span class="heading">Geordi</span>
	</a>
{/snippet}

<div class="flex min-h-dvh">
	{#if sidebar.current.open}
		<aside
			class="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-sidebar md:flex"
			style:width="{sidebar.current.width}px"
		>
			<div class="flex h-14 shrink-0 items-center justify-between pr-2.5 pl-4">
				{@render logo()}
				<Button
					variant="ghost"
					icon="icon-[lucide--panel-left-close]"
					label={toggleHint}
					onclick={toggleSidebar}
				/>
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
						resolve('/issues'),
						'icon-[lucide--circle-dot]',
						'Issues',
						page.url.pathname.startsWith('/issues')
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

				<div class="space-y-0.5">
					<p class="px-2.5 pb-1 label">Repositories</p>
					{#each (await nav).repos as repo (repo.id)}
						{@render link(
							resolve('/repos/[id]', { id: repo.id }),
							'icon-[lucide--folder-git-2]',
							repo.name,
							page.url.pathname === `/repos/${repo.id}`,
							repo.working
						)}
					{:else}
						<p class="px-2.5 text-sm text-muted">None yet.</p>
					{/each}
				</div>
			</nav>

			<div class="flex items-center justify-between border-t border-line px-4 py-2.5">
				<span class="text-sm text-muted">Appearance</span>
				<ThemeToggle />
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
	{:else}
		<!-- Hidden, but not gone: a rail with the way back. -->
		<aside
			class="sticky top-0 hidden h-dvh w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-sidebar py-3 md:flex"
		>
			<Button
				variant="ghost"
				icon="icon-[lucide--panel-left-open]"
				label={toggleHint}
				onclick={toggleSidebar}
			/>
			<a
				href={resolve('/workspaces/new')}
				class="item size-8 justify-center"
				aria-label="New workspace"
				title="New workspace"
			>
				<span class="icon-[lucide--plus] size-4"></span>
			</a>
		</aside>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		<header class="flex h-14 items-center gap-4 border-b border-line bg-sidebar px-4 md:hidden">
			{@render logo()}
			<a href={resolve('/issues')} class="text-sm text-muted">Issues</a>
			<div class="ml-auto"><ThemeToggle /></div>
		</header>
		{@render children()}
	</div>
</div>

{#snippet workspaces(parent: string | null)}
	<ul class={['space-y-px', parent && 'ml-3.5 border-l border-line pl-1.5']}>
		{#each tree.of(parent) as workspace (workspace.id)}
			{@const current = page.url.pathname === `/workspaces/${workspace.id}`}
			<li>
				<a
					href={resolve('/workspaces/[id]', { id: workspace.id })}
					class={['item px-2.5 py-1', current && 'item-active']}
					aria-current={current ? 'page' : undefined}
				>
					{#if tree.working(workspace)}<Spinner />{:else}<span class="dot"></span>{/if}
					<span class="min-w-0 flex-1 truncate">{workspace.title}</span>
					{#if !parent}
						<span class="max-w-20 shrink-0 truncate text-xs text-muted/80">
							{repoName(workspace.repoId)}
						</span>
					{/if}
				</a>
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
