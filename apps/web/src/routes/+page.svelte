<script lang="ts">
	import { resolve } from '$app/paths';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Page from '#lib/ui/Page.svelte';
	import { openSettings } from '#lib/components/settings.svelte.ts';
	import { getNavigation } from './nav.remote';

	const nav = getNavigation();
</script>

<Page title="Overview" wide>
	{#snippet description()}Pick a repository to start a workspace in it.{/snippet}

	<ul class="grid gap-4 sm:grid-cols-2">
		{#each (await nav).repos as repo (repo.id)}
			<li>
				<a
					href={resolve('/repos/[id]', { id: repo.id })}
					class="flex h-full flex-col gap-4 card p-5 card-link"
				>
					<div class="flex items-center gap-3">
						<span
							class="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent-ink"
						>
							<span class="icon-[lucide--folder-git-2] size-5"></span>
						</span>
						<div class="min-w-0">
							<p class="heading">{repo.name}</p>
							<p class="truncate code-dense text-muted" title={repo.path}>{repo.path}</p>
						</div>
					</div>
					<div class="mt-auto flex items-center gap-2">
						<Badge>
							{repo.workspaceCount}
							{repo.workspaceCount === 1 ? 'workspace' : 'workspaces'}
						</Badge>
						{#if repo.working > 0}
							<Badge tone="accent" dot>{repo.working} working</Badge>
						{/if}
					</div>
				</a>
			</li>
		{:else}
			<li class="empty sm:col-span-2">
				<p class="pb-4">Geordi doesn't know any repositories yet.</p>
				<Button variant="primary" onclick={() => openSettings('repositories')}>
					Add a repository
				</Button>
			</li>
		{/each}
	</ul>
</Page>
