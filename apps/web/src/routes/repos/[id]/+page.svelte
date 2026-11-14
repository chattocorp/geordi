<script lang="ts">
	import { resolve } from '$app/paths';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import AgentPicker from '#lib/components/workspace/AgentPicker.svelte';
	import { timeAgo } from '#lib/format.ts';
	import { submitOnEnter } from '#lib/keys.ts';
	import { getRepo } from '../../repos.remote';
	import { createWorkspace, getWorkspaces } from '../../workspaces.remote';

	let { params } = $props();

	const repo = $derived(await getRepo(params.id));
	const workspaces = $derived(getWorkspaces(params.id));
	const { repoId, agent, prompt } = createWorkspace.fields;
</script>

<svelte:head><title>{repo.name} · Geordi</title></svelte:head>

<main class="mx-auto w-full max-w-3xl space-y-10 px-6 py-10">
	<header class="space-y-1">
		<h1 class="text-3xl font-semibold tracking-tight">{repo.name}</h1>
		<p class="truncate font-mono text-xs text-muted" title={repo.path}>{repo.path}</p>
	</header>

	<form
		{...createWorkspace}
		class="rounded-2xl bg-surface shadow-float ring-1 ring-line/60 focus-within:ring-accent/60"
	>
		<input {...repoId.as('hidden', repo.id)} />
		<label for="prompt" class="block px-5 pt-5 text-sm font-medium">New workspace</label>
		<textarea
			{...prompt.as('text')}
			id="prompt"
			rows="3"
			placeholder="What should the agent do?"
			onkeydown={submitOnEnter}
			class="block w-full resize-none bg-transparent px-5 py-2 text-lg placeholder:text-muted/60 focus-visible:outline-none"
		></textarea>
		{#each prompt.issues() ?? [] as problem (problem.message)}
			<p class="px-5 text-sm text-danger">{problem.message}</p>
		{/each}
		<div class="flex flex-wrap items-center gap-2 px-4 pt-2 pb-4">
			<AgentPicker attributes={(name) => agent.as('radio', name, name === 'claude')} />
			<button
				class="ml-auto flex items-center gap-2 rounded-full bg-accent py-2 pr-4 pl-3.5 text-sm font-semibold text-on-accent shadow-soft hover:brightness-105"
			>
				<span class="icon-[lucide--arrow-up] size-4"></span>
				Start workspace
			</button>
		</div>
	</form>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold tracking-tight">Workspaces</h2>
		<ul class="space-y-2">
			{#each await workspaces as workspace (workspace.id)}
				<li>
					<a
						href={resolve('/workspaces/[id]', { id: workspace.id })}
						class="flex items-center gap-3.5 rounded-xl bg-surface px-4 py-3 shadow-soft ring-1 ring-line/60 transition-shadow hover:shadow-float"
					>
						<div class="flex shrink-0 -space-x-1.5">
							{#each workspace.agents as name (name)}
								<AgentAvatar agent={name} />
							{/each}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium">{workspace.title}</p>
							<p class="text-xs text-muted">{timeAgo(workspace.updatedAt)}</p>
						</div>
						<StatusBadge running={workspace.status === 'running'} />
					</a>
				</li>
			{:else}
				<li class="rounded-xl border border-dashed border-line px-4 py-10 text-center text-muted">
					No workspaces yet. Describe a task above to start one.
				</li>
			{/each}
		</ul>
	</section>
</main>
