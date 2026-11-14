<script lang="ts">
	import { resolve } from '$app/paths';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import AgentPicker from '#lib/components/workspace/AgentPicker.svelte';
	import { timeAgo } from '#lib/format.ts';
	import Button from '#lib/ui/Button.svelte';
	import Composer from '#lib/ui/Composer.svelte';
	import Page from '#lib/ui/Page.svelte';
	import { getRepo } from '../../repos.remote';
	import { createWorkspace, getWorkspaces } from '../../workspaces.remote';

	let { params } = $props();

	const repo = $derived(await getRepo(params.id));
	const workspaces = $derived(getWorkspaces(params.id));
	const { repoId, agent, prompt } = createWorkspace.fields;
</script>

<Page title={repo.name}>
	{#snippet description()}
		<p class="truncate code-dense" title={repo.path}>{repo.path}</p>
	{/snippet}

	<Composer
		form={createWorkspace}
		label="New workspace"
		placeholder="What should the agent do?"
		field={prompt.as('text')}
		problems={prompt.issues()?.map((problem) => problem.message)}
	>
		{#snippet header()}<input {...repoId.as('hidden', repo.id)} />{/snippet}
		{#snippet footer()}
			<AgentPicker attributes={(name) => agent.as('radio', name, name === 'claude')} />
			<Button type="submit" variant="primary" icon="icon-[lucide--arrow-up]" class="ml-auto">
				Start workspace
			</Button>
		{/snippet}
	</Composer>

	<section class="space-y-3">
		<h2 class="heading">Workspaces</h2>
		<ul class="space-y-2">
			{#each await workspaces as workspace (workspace.id)}
				<li>
					<a
						href={resolve('/workspaces/[id]', { id: workspace.id })}
						class="flex items-center gap-3.5 card px-4 py-3 card-link"
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
				<li class="empty">No workspaces yet. Describe a task above to start one.</li>
			{/each}
		</ul>
	</section>
</Page>
