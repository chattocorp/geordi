<script lang="ts">
	import Badge from '#lib/ui/Badge.svelte';
	import { getChanges, getUpstream } from '../../../routes/workspaces.remote';
	import UpstreamStatus from './UpstreamStatus.svelte';

	type Props = {
		workspaceId: string;
		/** Different after every change to the workspace's files: the cue to look again. */
		revision: number;
		onopen(path: string): void;
	};
	let { workspaceId, revision, onopen }: Props = $props();

	const changes = $derived(getChanges(workspaceId));
	const files = $derived(changes.current?.files ?? []);

	const upstream = $derived(getUpstream(workspaceId));

	// The daemon watches the workspace's files and Git state while we look at it, so both
	// are asked for again exactly when something changed there.
	$effect(() => {
		void revision;
		changes.refresh();
		upstream.refresh();
	});

	// What happens to the pull request on the upstream forge (checks, reviews) is not ours
	// to see, so that is still asked for now and then. The daemon reuses answers for a while.
	$effect(() => {
		const query = upstream;
		const timer = setInterval(() => !document.hidden && query.refresh(), 60_000);
		return () => clearInterval(timer);
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
		{#if files.length > 0}<Badge>{files.length}</Badge>{/if}
	</header>

	{#if upstream.current?.upstream}
		<UpstreamStatus upstream={upstream.current.upstream} />
	{/if}

	<div class="scroller py-1.5">
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
