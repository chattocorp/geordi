<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
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
			ids.has(workspace.parentWorkspaceId ?? '') ? workspace.parentWorkspaceId! : ''
		);
		const of = (id: string | null) => children[id ?? ''] ?? [];
		/** A workspace counts as working while anything beneath it is. */
		const working = (workspace: Item): boolean =>
			workspace.status === 'running' || of(workspace.id).some(working);
		return { of, working };
	});

	const repoName = (id: string) => nav.current?.repos.find((repo) => repo.id === id)?.name;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Geordi</title>
</svelte:head>

{#snippet logo()}
	<a href={resolve('/')} class="flex items-center gap-3" aria-label="Geordi home">
		<!-- The visor: Geordi's mark. -->
		<span class="h-2 w-6 rounded-full bg-accent shadow-[0_0_14px_var(--accent)]"></span>
		<span class="text-base font-semibold tracking-tight">Geordi</span>
	</a>
{/snippet}

<div class="flex min-h-dvh">
	<aside
		class="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-sidebar md:flex"
	>
		<div class="flex h-14 items-center px-4">{@render logo()}</div>

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
			</div>

			{#if tree.of(null).length > 0}
				<div>
					<p class="px-2.5 pb-1 text-xs font-medium text-muted">Workspaces</p>
					{@render workspaces(null)}
				</div>
			{/if}

			<div class="space-y-0.5">
				<p class="px-2.5 pb-1 text-xs font-medium text-muted">Repositories</p>
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
	</aside>

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
					class={[
						'flex items-center gap-2 rounded-md px-2.5 py-1 text-sm',
						current ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink'
					]}
					aria-current={current ? 'page' : undefined}
				>
					<span
						class={[
							'size-1.5 shrink-0 rounded-full',
							tree.working(workspace) ? 'bg-accent' : 'bg-line'
						]}
					></span>
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
		class={[
			'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm',
			current
				? 'bg-surface font-medium text-ink shadow-soft'
				: 'text-muted hover:bg-surface/60 hover:text-ink'
		]}
		aria-current={current ? 'page' : undefined}
	>
		<span class={['size-4 shrink-0', icon]}></span>
		<span class="truncate">{label}</span>
		{#if working > 0}
			<span
				class="ml-auto rounded-full bg-accent-soft px-1.5 text-xs font-medium text-accent-ink"
				title="{working} working">{working}</span
			>
		{/if}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}
