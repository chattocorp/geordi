<script lang="ts">
	import { problemOf } from '#lib/problem.ts';
	import { theme } from '#lib/theme.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import { getNavigation } from '../../routes/nav.remote';
	import { registerRepo, removeRepo } from '../../routes/repos.remote';
	import { settings, type Section } from './settings.svelte.ts';

	const nav = getNavigation();
	const repos = $derived(nav.current?.repos ?? []);

	const sections: { id: Section; label: string; icon: string }[] = [
		{ id: 'general', label: 'General', icon: 'icon-[lucide--sliders-horizontal]' },
		{ id: 'repositories', label: 'Repositories', icon: 'icon-[lucide--folder-git-2]' }
	];

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

	// what went wrong belongs to the visit it happened in
	$effect(() => {
		if (!settings.open) problem = undefined;
	});
</script>

<!-- Geordi's settings (FDR-005): how it looks, and the repositories it knows. -->
<Dialog bind:open={settings.open} label="Settings" class="h-112">
	<div class="flex h-full">
		<div class="w-48 shrink-0 space-y-3 border-r border-line bg-sidebar p-2.5">
			<p class="px-2.5 pt-2 heading">Settings</p>
			<div role="tablist" aria-orientation="vertical" aria-label="Settings" class="space-y-0.5">
				{#each sections as section (section.id)}
					<button
						type="button"
						role="tab"
						id="settings-tab-{section.id}"
						aria-selected={settings.section === section.id}
						aria-controls="settings-panel"
						onclick={() => (settings.section = section.id)}
						class={['item w-full px-2.5 py-1.5', settings.section === section.id && 'item-active']}
					>
						<span class={[section.icon, 'size-4 shrink-0']}></span>
						{section.label}
					</button>
				{/each}
			</div>
		</div>

		<div
			role="tabpanel"
			id="settings-panel"
			aria-labelledby="settings-tab-{settings.section}"
			class="scroller relative min-w-0 flex-1 p-6"
		>
			<Button
				variant="ghost"
				icon="icon-[lucide--x]"
				label="Close"
				class="absolute top-3 right-3"
				onclick={() => (settings.open = false)}
			/>

			{#if settings.section === 'general'}
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
			{:else}
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
			{/if}
		</div>
	</div>
</Dialog>
