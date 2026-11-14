<script lang="ts">
	import Badge from '#lib/ui/Badge.svelte';
	import { getChanges, getUpstream } from '../../../routes/workspaces.remote';
	import UpstreamStatus from './UpstreamStatus.svelte';

	type Props = { workspaceId: string; onopen(path: string): void };
	let { workspaceId, onopen }: Props = $props();

	const changes = $derived(getChanges(workspaceId));
	const files = $derived(changes.current?.files ?? []);
	const total = (key: 'added' | 'removed') =>
		files.reduce((sum, file) => sum + (file[key] ?? 0), 0);

	const upstream = $derived(getUpstream(workspaceId));

	// The worktree changes behind the forge's back (agents, the terminal), and so does the
	// pull request, so poll. The daemon spares the upstream forge: it reuses answers for a while.
	$effect(() => {
		const queries = [changes, upstream] as const;
		const timers = [
			setInterval(() => !document.hidden && queries[0].refresh(), 4000),
			setInterval(() => !document.hidden && queries[1].refresh(), 15_000)
		];
		return () => timers.forEach(clearInterval);
	});
</script>

{#snippet stats(added: number | null, removed: number | null)}
	<span class="shrink-0 code-dense">
		{#if added === null}
			<span class="text-muted">binary</span>
		{:else}
			{#if added}<span class="text-ok">+{added}</span>{/if}
			{#if removed}<span class="text-danger">−{removed}</span>{/if}
		{/if}
	</span>
{/snippet}

<section class="flex min-h-0 flex-1 flex-col" aria-label="Changes">
	<header class="pane-bar gap-2 px-3.5">
		<h2 class="text-sm font-medium">Changes</h2>
		{#if files.length > 0}
			<Badge>{files.length}</Badge>
			<span class="ml-auto">{@render stats(total('added'), total('removed'))}</span>
		{/if}
	</header>

	{#if upstream.current?.upstream}
		<UpstreamStatus upstream={upstream.current.upstream} />
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto py-1.5">
		{#if !changes.current}
			<p class="px-3.5 py-2 text-sm text-muted">Loading…</p>
		{:else if changes.current.unavailable}
			<p class="px-3.5 py-2 text-sm text-muted">{changes.current.unavailable}</p>
		{:else}
			<ul>
				{#each files as file (file.path)}
					{@const slash = file.path.lastIndexOf('/') + 1}
					<li>
						<button
							type="button"
							onclick={() => onopen(file.path)}
							title={file.path}
							class="flex w-full items-center gap-3 px-3.5 py-1 text-left code-dense hover:bg-sunken"
						>
							<span class="min-w-0 flex-1 truncate">
								<span class="text-muted">{file.path.slice(0, slash)}</span>{file.path.slice(slash)}
							</span>
							{@render stats(file.added, file.removed)}
						</button>
					</li>
				{:else}
					<li class="px-3.5 py-2 text-sm text-muted">No changes yet.</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>
