<script lang="ts">
	import { getChanges } from '../../../routes/workspaces.remote';

	type Props = { workspaceId: string; onopen(path: string): void };
	let { workspaceId, onopen }: Props = $props();

	const changes = $derived(getChanges(workspaceId));
	const files = $derived(changes.current?.files ?? []);
	const total = (key: 'added' | 'removed') =>
		files.reduce((sum, file) => sum + (file[key] ?? 0), 0);

	// The worktree changes behind the forge's back (agents, the terminal), so poll.
	$effect(() => {
		const query = changes;
		const timer = setInterval(() => !document.hidden && query.refresh(), 4000);
		return () => clearInterval(timer);
	});
</script>

{#snippet stats(added: number | null, removed: number | null)}
	<span class="shrink-0 font-mono text-xs">
		{#if added === null}
			<span class="text-muted">binary</span>
		{:else}
			{#if added}<span class="text-ok">+{added}</span>{/if}
			{#if removed}<span class="text-danger">−{removed}</span>{/if}
		{/if}
	</span>
{/snippet}

<section class="flex min-h-0 flex-1 flex-col" aria-label="Changes">
	<header class="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-sidebar px-3.5">
		<h2 class="text-[13px] font-medium">Changes</h2>
		{#if files.length > 0}
			<span class="rounded-full bg-sunken px-1.5 text-[11px] font-medium text-muted">
				{files.length}
			</span>
			<span class="ml-auto">{@render stats(total('added'), total('removed'))}</span>
		{/if}
	</header>

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
							class="flex w-full items-center gap-3 px-3.5 py-1 text-left font-mono text-[12.5px] hover:bg-sunken"
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
