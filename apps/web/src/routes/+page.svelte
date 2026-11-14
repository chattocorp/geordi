<script lang="ts">
	import { resolve } from '$app/paths';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Page from '#lib/ui/Page.svelte';
	import { getNavigation } from './nav.remote';
	import { registerRepo } from './repos.remote';

	const nav = getNavigation();
	const { path } = registerRepo.fields;
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
		{/each}

		<li class="rounded-card border border-dashed border-line p-5">
			<form {...registerRepo} class="flex h-full flex-col gap-3">
				<div>
					<p class="heading">Register a repository</p>
					<p class="text-sm text-muted">The path to a Git repository on this machine.</p>
				</div>
				<div class="mt-auto flex items-center gap-2">
					<input
						{...path.as('text')}
						placeholder="~/src/my-project"
						aria-label="Repository path"
						class="min-w-0 flex-1 input code"
					/>
					<Button type="submit" variant="primary">Register</Button>
				</div>
				{#each path.issues() ?? [] as problem (problem.message)}
					<p class="text-sm text-danger">{problem.message}</p>
				{/each}
			</form>
		</li>
	</ul>
</Page>
