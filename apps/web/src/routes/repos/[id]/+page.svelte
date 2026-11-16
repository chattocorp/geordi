<script lang="ts">
	import { resolve } from '$app/paths';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import NewWorkspace from '#lib/components/workspace/NewWorkspace.svelte';
	import { timeAgo } from '#lib/format.ts';
	import { ownParam } from '#lib/route.svelte.ts';
	import Page from '#lib/ui/Page.svelte';
	import { getRepo } from '../../repos.remote';
	import { getWorkspaces } from '../../workspaces.remote';

	let { params } = $props();
	// not another route's `id`, which this page sees while it is being left (see `ownParam`)
	const id = ownParam('/repos/[id]', () => params.id);

	const repo = $derived(await getRepo(id.current));
	const workspaces = $derived(getWorkspaces(id.current));
</script>

<Page title={repo.name}>
	{#snippet description()}
		<p class="truncate code-dense" title={repo.path}>{repo.path}</p>
	{/snippet}

	<NewWorkspace repos={[repo]} label="New workspace" />

	<section class="space-y-3">
		<h2 class="heading">Workspaces</h2>
		<ul class="space-y-2">
			{#each await workspaces as workspace (workspace.id)}
				<li>
					<a
						href={resolve('/workspaces/[id]', { id: workspace.id })}
						class="flex items-center gap-3.5 card px-4 py-3 card-link"
					>
						<AgentAvatar agent={workspace.agent} />
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
