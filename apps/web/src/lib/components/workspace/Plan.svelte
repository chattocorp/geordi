<script lang="ts">
	/**
	 * A workspace's Plan window (FDR-019): its scope, the items under its item, edited as in
	 * the sidebar, with its child agents as rows that lead to them. Narrow beside the
	 * conversation, or wide in the main area: the outline keeps to a readable width.
	 */
	import { resolve } from '$app/paths';
	import { persisted } from '@geordi/ui/persisted';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import Outline, { type WorkspaceRowProps } from '#lib/components/Outline.svelte';
	import { outlineRows, scopeItems, zoomTrail } from '#lib/family.ts';
	import { unread } from '#lib/notifications.svelte.ts';
	import { zoomInHistory } from '#lib/zoom.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';

	let { workspaceId, nav }: { workspaceId: string; nav: Navigation } = $props();

	/** What is folded away here: a preference of this browser, as in the sidebar. */
	const folded = persisted<string[]>('geordi:plan-folded', []);
	const workspaceById = $derived(new Map(nav.workspaces.map((each) => [each.id, each])));
	const repoNames = $derived(new Map(nav.repos.map((repo) => [repo.id, repo.name])));
	/** The item of its scope zoomed into, if any: a preference of this browser, per workspace. */
	// svelte-ignore state_referenced_locally
	const zoom = zoomInHistory(
		`plan:${workspaceId}`,
		persisted<string | null>(`geordi:plan-zoom:${workspaceId}`, null)
	);
	/**
	 * The way down to it from the workspace: only within its scope, so only through items
	 * without workspaces; empty while not zoomed, or when it is gone or out of the scope.
	 */
	const trail = $derived.by(() => {
		const line = zoomTrail(nav.items, zoom.current, workspaceId);
		return line.some((item) => item.workspace) ? [] : line;
	});
	const root = $derived(trail.at(-1)?.id ?? workspaceId);
	const rows = $derived(
		outlineRows(scopeItems(nav.items, root), nav.workspaces, { folded: folded.current })
	);
</script>

<div class="scroller h-full">
	<div class="mx-auto w-full max-w-3xl p-2">
		{#if rows.length === 0 && !trail.length}
			<p class="px-2 pt-1 pb-2 text-sm text-muted">
				Write down what is to be done here. The agent sees it at its next turn, and ticks off what
				it has done.
			</p>
		{/if}
		<Outline
			{rows}
			{folded}
			{root}
			{trail}
			home="Plan"
			onzoom={(id) => (zoom.current = id)}
			zoomable={(entry) => !entry.workspace}
			live={(id) => workspaceById.has(id)}
		>
			{#snippet workspace(row)}{@render child(row)}{/snippet}
		</Outline>
	</div>
</div>

<!-- a child agent: its own items are its own, so it is a row that leads to it -->
{#snippet child({ entry, dragging, target }: WorkspaceRowProps)}
	{@const workspace = workspaceById.get(entry.id)!}
	{#snippet repoIcon()}<RepoIcon
			id={workspace.repoId!}
			name={repoNames.get(workspace.repoId!) ?? ''}
			small
		/>{/snippet}
	<WorkspaceRow
		title={workspace.title}
		href={resolve('/workspaces/[id]', { id: workspace.id })}
		icon={workspace.repoId === null ? 'icon-[lucide--folder-kanban]' : repoIcon}
		{dragging}
		highlighted={target}
		unread={unread.has(workspace.id)}
		asking={workspace.outcome === 'asking'}
		waiting={workspace.waiting}
		working={workspace.working}
		locked={workspace.locked}
		inactive={workspace.inactive}
		progress={workspace.activeAction}
		standing={workspace.standing}
	/>
{/snippet}
