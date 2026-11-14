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

	/** The repository the current page belongs to (directly, or via one of its sessions). */
	const activeRepo = $derived.by(() => {
		const id = page.params.id;
		if (!id) return null;
		if (page.route.id === '/repos/[id]') return id;
		return nav.current?.find((repo) => repo.recent.some((s) => s.id === id))?.id ?? null;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Geordi</title>
</svelte:head>

{#snippet logo()}
	<a href={resolve('/')} class="flex items-center gap-3" aria-label="Geordi home">
		<!-- The visor: Geordi's mark. -->
		<span class="h-2 w-6 rounded-full bg-accent shadow-[0_0_14px_var(--accent)]"></span>
		<span class="text-[17px] font-semibold tracking-tight">Geordi</span>
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

			<div class="space-y-0.5">
				<p class="px-2.5 pb-1 text-xs font-medium text-muted">Repositories</p>
				{#each await nav as repo (repo.id)}
					{@render link(
						resolve('/repos/[id]', { id: repo.id }),
						'icon-[lucide--folder-git-2]',
						repo.name,
						page.url.pathname === `/repos/${repo.id}`,
						repo.working
					)}
					{#if activeRepo === repo.id && repo.recent.length > 0}
						<ul class="my-1 ml-[1.2rem] space-y-px border-l border-line pl-2">
							{#each repo.recent as session (session.id)}
								{@const current = page.url.pathname === `/sessions/${session.id}`}
								<li>
									<a
										href={resolve('/sessions/[id]', { id: session.id })}
										class={[
											'flex items-center gap-2 rounded-md px-2 py-1 text-[13px]',
											current ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink'
										]}
										aria-current={current ? 'page' : undefined}
									>
										<span
											class={[
												'size-1.5 shrink-0 rounded-full',
												session.status === 'running' ? 'bg-accent' : 'bg-line'
											]}
										></span>
										<span class="truncate">{session.title}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				{:else}
					<p class="px-2.5 text-[13px] text-muted">None yet.</p>
				{/each}
			</div>
		</nav>

		<div class="flex items-center justify-between border-t border-line px-4 py-2.5">
			<span class="text-[13px] text-muted">Appearance</span>
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
				class="ml-auto rounded-full bg-accent-soft px-1.5 text-[11px] font-medium text-accent-ink"
				title="{working} working">{working}</span
			>
		{/if}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}
