<script lang="ts">
	import { version } from '../../../package.json';
	import { onMount } from 'svelte';
	import Providers from './Providers.svelte';
	import AgentAccess from './AgentAccess.svelte';
	import DesktopUpdates, { type UpdateBridge, type UpdateState } from './DesktopUpdates.svelte';
	import Logo from './Logo.svelte';
	import { notifications, test } from '#lib/notifications.svelte.ts';
	import { problemOf } from '#lib/problem.ts';
	import { hint, shortcutGroups } from '@geordi/ui/keys';
	import { theme } from '#lib/theme.svelte.ts';
	import Button from '@geordi/ui/Button.svelte';
	import TitleBar from '@geordi/ui/TitleBar.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import { follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AddRepository from './AddRepository.svelte';
	import ForgeCheck from './ForgeCheck.svelte';
	import RepoIcon from './RepoIcon.svelte';
	import { checkRepoForge, removeRepo } from '../../routes/repos.remote';
	import { issueAccess, revokeAccess } from '../../routes/access.remote';
	import { getRibbonPosition, sections, settingsPath, type Section } from './settings.svelte.ts';

	let { section }: { section: Section } = $props();

	let updates = $state<UpdateBridge>();
	let updateState = $state<UpdateState | null>(null);
	onMount(() => {
		updates = (window as { geordiDesktop?: { updates?: UpdateBridge } }).geordiDesktop?.updates;
		return updates?.subscribe((state) => (updateState = state));
	});

	const ribbonPosition = getRibbonPosition();
	const nav = follow<Navigation>('navigation');
	const repos = $derived(nav.current?.repos ?? []);

	/** What came of the last test notification, if one was sent. */
	let tested = $state<Awaited<ReturnType<typeof test>>>();

	let adding = $state<AddRepository>();
	let selectedRepo = $state<string>();
	let problem = $state<string>();

	/** Runs something the server may refuse, and says so if it does. */
	async function attempt(action: () => Promise<unknown>, fallback: string) {
		problem = undefined;
		try {
			await action();
			return true;
		} catch (error) {
			problem = problemOf(error, fallback);
			return false;
		}
	}

	// what went wrong belongs to the section it happened in
	$effect.pre(() => {
		void section;
		problem = tested = undefined;
	});
</script>

<!-- Geordi's settings (FDR-005): how it looks, what it tells of, the repositories it knows. -->
<svelte:head><title>Settings · Geordi</title></svelte:head>

<TitleBar class="hidden md:flex"><h1 class="truncate heading">Settings</h1></TitleBar>

<!-- two sheets, like the frame around them: the sections, quiet, beside the one on screen -->
<div class="mx-2 mb-2 flex flex-1 gap-2">
	<nav aria-label="Settings" class="w-14 shrink-0 space-y-0.5 sheet-quiet p-2 sm:w-52">
		{#each sections as { id, label, icon } (id)}
			<a
				href={settingsPath(id)}
				title={label}
				aria-current={section === id ? 'page' : undefined}
				class={['item px-2.5 py-1.5', section === id && 'item-active font-medium']}
			>
				<span class={[icon, 'size-4 shrink-0']}></span>
				<span class="sr-only truncate sm:not-sr-only">{label}</span>
			</a>
		{/each}
	</nav>

	<section
		aria-label={sections.find(({ id }) => id === section)?.label}
		class="min-w-0 flex-1 sheet px-8 py-6"
	>
		<div class="max-w-2xl">
			{#if section === 'general'}
				<h2 class="pb-4 heading">General</h2>
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="text-sm font-medium">Theme</p>
						<p class="text-sm text-muted">How Geordi looks in this browser.</p>
					</div>
					<Segmented
						label="Theme"
						bind:value={theme.current}
						options={[
							{ value: 'system', label: 'System' },
							{ value: 'light', label: 'Light' },
							{ value: 'dark', label: 'Dark' }
						]}
					/>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-4 pt-6">
					<div>
						<p class="text-sm font-medium">Action ribbon position</p>
						<p class="text-sm text-muted">
							Choose which right edge the workspace actions align with.
						</p>
					</div>
					<Segmented
						label="Action ribbon position"
						bind:value={ribbonPosition.current}
						options={[
							{ value: 'pane', label: 'Main pane' },
							{ value: 'window', label: 'Window' }
						]}
					/>
				</div>
			{:else if section === 'notifications'}
				<h2 class="heading">Notifications</h2>
				<p class="pb-4 text-sm text-muted">
					Geordi tells you when an agent is done, or ran into a problem, in a workspace you are not
					looking at.
				</p>
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="text-sm font-medium">Notify me</p>
						<p class="text-sm text-muted">A notification and a quiet sound.</p>
					</div>
					<Segmented
						label="Notifications"
						bind:value={
							() => (notifications.on ? 'on' : 'off'),
							(value) => (notifications.on = value === 'on')
						}
						options={[
							{ value: 'on', label: 'On' },
							{ value: 'off', label: 'Off' }
						]}
					/>
				</div>
				<div class="flex items-center justify-between gap-4 pt-6">
					<div>
						<p class="text-sm font-medium">Try it</p>
						<p class="text-sm text-muted">
							{#if tested === 'sent'}
								Sent. If nothing showed, your system is holding it back: look for Geordi in its
								notification settings, and for a focus mode that is on.
							{:else if tested === 'blocked' || notifications.permission === 'denied'}
								Geordi may not show notifications here: only the sound plays. Allow them in your
								system's notification settings.
							{:else if tested === 'unsupported' || notifications.permission === 'unsupported'}
								There are no notifications to be had here: only the sound plays.
							{:else}
								Shows a notification and plays the sound, as when an agent is done.
							{/if}
						</p>
					</div>
					<Button icon="icon-[lucide--bell-ring]" onclick={async () => (tested = await test())}>
						Send a test
					</Button>
				</div>
			{:else if section === 'keyboard'}
				<h2 class="heading">Keyboard</h2>
				<p class="pb-4 text-sm text-muted">The shortcuts Geordi knows.</p>
				<div class="space-y-6">
					{#each shortcutGroups() as [group, shortcuts] (group)}
						<div class="space-y-2">
							<h3 class="label">{group}</h3>
							<ul class="divide-y divide-line/60 card">
								{#each shortcuts as [id, shortcut] (id)}
									<li class="flex items-center justify-between gap-4 px-3.5 py-2">
										<span class="text-sm">{shortcut.label}</span>
										<kbd class="font-sans text-sm text-muted">{hint(id)}</kbd>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{:else if section === 'repositories'}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h2 class="heading">Repositories</h2>
					<Button size="sm" icon="icon-[lucide--plus]" onclick={() => adding?.start()}
						>Add repository</Button
					>
				</div>
				{#if repos.length}
					<p class="mt-2 mb-5 text-sm text-muted">Select a repository to check its forge access.</p>
					<ul class="space-y-1">
						{#each repos as repo (repo.id)}
							{@const expanded = selectedRepo === repo.id}
							<li class={['rounded-card', expanded && 'bg-sunken']}>
								<button
									type="button"
									aria-expanded={expanded}
									onclick={() => (selectedRepo = expanded ? undefined : repo.id)}
									class="flex w-full items-center gap-3 rounded-card px-3 py-3 text-left hover:bg-hover"
								>
									<RepoIcon id={repo.id} />
									<span class="min-w-0 flex-1">
										<span class="block truncate font-medium">{repo.name}</span>
										<span
											dir="rtl"
											class="block truncate text-left code-dense text-muted"
											title={repo.path}><bdi>{repo.path}</bdi></span
										>
									</span>
									{#if repo.workspaceCount}
										<span class="shrink-0 text-xs text-muted"
											>{repo.workspaceCount}
											{repo.workspaceCount === 1 ? 'workspace' : 'workspaces'}</span
										>
									{/if}
									<span
										aria-hidden="true"
										class={[
											'icon-[lucide--chevron-right] size-4 shrink-0 text-muted',
											expanded && 'rotate-90'
										]}
									></span>
								</button>
								{#if expanded}
									<div class="px-3 pb-3">
										<ForgeCheck check={() => checkRepoForge(repo.id)} />
										{#if !repo.workspaceCount}
											<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
												<span class="text-xs text-muted"
													>Removing this repository keeps its files on disk.</span
												>
												<Button
													size="sm"
													variant="ghost"
													onclick={() => attempt(() => removeRepo(repo.id), 'Could not remove it')}
													>Remove repository</Button
												>
											</div>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">No repositories yet.</p>
				{/if}
				<AddRepository
					bind:this={adding}
					onadded={({ id }) => goto(resolve(`/?repo=${encodeURIComponent(id)}`))}
				/>
				{#if problem}<Notice>{problem}</Notice>{/if}
			{:else if section === 'providers'}
				<Providers
					harnesses={nav.connected ? nav.current?.harnesses : undefined}
					active={nav.current?.activeAgents ?? []}
				/>
			{:else if section === 'access'}
				<AgentAccess
					{repos}
					grants={nav.current?.access ?? []}
					issue={issueAccess}
					revoke={revokeAccess}
				/>
			{:else}
				<h2 class="heading">About</h2>
				<div class="mt-6 space-y-2">
					<div class="flex items-center gap-2.5">
						<Logo />
						<h3 class="title">Geordi</h3>
					</div>
					<p class="text-sm text-muted">Version {version}</p>
					<p>A self-hostable code forge and agent orchestrator.</p>
				</div>
				{#if updates && updateState}<DesktopUpdates state={updateState} controls={updates} />{/if}
			{/if}
		</div>
	</section>
</div>
