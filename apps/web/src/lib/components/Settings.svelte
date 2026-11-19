<script lang="ts">
	import { version } from '../../../package.json';
	import { onMount } from 'svelte';
	import AgentAccess from './AgentAccess.svelte';
	import DesktopUpdates, { type UpdateBridge, type UpdateState } from './DesktopUpdates.svelte';
	import Logo from './Logo.svelte';
	import { notifications, test } from '#lib/notifications.svelte.ts';
	import { problemOf } from '#lib/problem.ts';
	import { hint, shortcutGroups } from '#lib/keys.ts';
	import { theme } from '#lib/theme.svelte.ts';
	import Button from '@geordi/ui/Button.svelte';
	import TitleBar from '#lib/ui/TitleBar.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import { follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import { registerRepo, removeRepo } from '../../routes/repos.remote';
	import { issueAccess, revokeAccess } from '../../routes/access.remote';
	import { sections, settingsPath, type Section } from './settings.svelte.ts';

	let { section }: { section: Section } = $props();

	let updates = $state<UpdateBridge>();
	let updateState = $state<UpdateState | null>(null);
	onMount(() => {
		updates = (window as { geordiDesktop?: { updates?: UpdateBridge } }).geordiDesktop?.updates;
		return updates?.subscribe((state) => (updateState = state));
	});

	const nav = follow<Navigation>('navigation');
	const repos = $derived(nav.current?.repos ?? []);

	/** What came of the last test notification, if one was sent. */
	let tested = $state<Awaited<ReturnType<typeof test>>>();

	let path = $state('');
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

	async function add(event: SubmitEvent) {
		event.preventDefault();
		if (await attempt(() => registerRepo(path), 'Could not add the repository')) path = '';
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
				<h2 class="heading">Repositories</h2>
				<p class="pb-4 text-sm text-muted">The Git repositories agents can work in.</p>

				<div class="space-y-3">
					{#if repos.length > 0}
						<ul class="divide-y divide-line/60 card">
							{#each repos as repo (repo.id)}
								<li class="flex items-center gap-3 py-2 pr-2 pl-3.5">
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{repo.name}</p>
										<p class="truncate code-dense text-muted" title={repo.path}>{repo.path}</p>
									</div>
									{#if repo.workspaceCount > 0}
										<span class="shrink-0 text-xs text-muted">
											{repo.workspaceCount}
											{repo.workspaceCount === 1 ? 'workspace' : 'workspaces'}
										</span>
									{/if}
									<Button
										variant="ghost"
										icon="icon-[lucide--trash-2]"
										label={repo.workspaceCount > 0
											? `Archive ${repo.name}'s workspaces to remove it`
											: `Remove ${repo.name}`}
										disabled={repo.workspaceCount > 0}
										onclick={() => attempt(() => removeRepo(repo.id), 'Could not remove it')}
									/>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="empty">No repositories yet. Add one below.</p>
					{/if}

					<form onsubmit={add} class="flex items-center gap-2">
						<input
							bind:value={path}
							placeholder="~/src/my-project"
							aria-label="Path to a Git repository on this machine"
							class="min-w-0 flex-1 input code"
						/>
						<Button type="submit" variant="primary" disabled={!path.trim()}>Add</Button>
					</form>
					{#if problem}<Notice>{problem}</Notice>{/if}
					<p class="text-xs text-muted">
						Removing a repository only makes Geordi forget it. Nothing on disk changes.
					</p>
				</div>
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
