<script lang="ts">
	import { resolve } from '$app/paths';
	import { getNavigation } from './nav.remote';
	import { registerRepo } from './repos.remote';

	const nav = getNavigation();
	const { path } = registerRepo.fields;
</script>

<svelte:head><title>Overview · Geordi</title></svelte:head>

<main class="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
	<header class="space-y-1">
		<h1 class="text-3xl font-semibold tracking-tight">Overview</h1>
		<p class="text-muted">Pick a repository to start an agent session in it.</p>
	</header>

	<ul class="grid gap-4 sm:grid-cols-2">
		{#each await nav as repo (repo.id)}
			<li>
				<a
					href={resolve('/repos/[id]', { id: repo.id })}
					class="flex h-full flex-col gap-4 rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-line/60 transition-shadow hover:shadow-float"
				>
					<div class="flex items-center gap-3">
						<span
							class="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"
						>
							<span class="icon-[lucide--folder-git-2] size-5"></span>
						</span>
						<div class="min-w-0">
							<p class="font-semibold">{repo.name}</p>
							<p class="truncate font-mono text-xs text-muted" title={repo.path}>{repo.path}</p>
						</div>
					</div>
					<div class="mt-auto flex items-center gap-2 text-sm">
						<span class="rounded-full bg-sunken px-2.5 py-0.5 text-muted">
							{repo.sessionCount}
							{repo.sessionCount === 1 ? 'session' : 'sessions'}
						</span>
						{#if repo.working > 0}
							<span
								class="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 font-medium text-accent-ink"
							>
								<span class="size-1.5 rounded-full bg-accent"></span>
								{repo.working} working
							</span>
						{/if}
					</div>
				</a>
			</li>
		{/each}

		<li class="rounded-2xl border border-dashed border-line p-5">
			<form {...registerRepo} class="flex h-full flex-col gap-3">
				<div>
					<p class="font-semibold">Register a repository</p>
					<p class="text-sm text-muted">The path to a Git repository on this machine.</p>
				</div>
				<div class="mt-auto flex gap-2">
					<input
						{...path.as('text')}
						placeholder="~/src/my-project"
						aria-label="Repository path"
						class="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2 font-mono text-sm shadow-soft ring-1 ring-line/60 placeholder:text-muted/70"
					/>
					<button
						class="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-bg hover:opacity-90"
					>
						Register
					</button>
				</div>
				{#each path.issues() ?? [] as problem (problem.message)}
					<p class="text-sm text-danger">{problem.message}</p>
				{/each}
			</form>
		</li>
	</ul>
</main>
