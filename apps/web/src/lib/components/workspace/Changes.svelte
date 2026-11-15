<script lang="ts">
	import type { WorktreeState } from '#lib/server/watchers.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import UpstreamStatus from './UpstreamStatus.svelte';

	type Props = {
		/**
		 * How the workspace's files and its pull request stand, kept up to date by the forge
		 * (see `getWorkspace`). `null` until first loaded.
		 */
		git: WorktreeState | null;
		onopen(path: string): void;
	};
	let { git, onopen }: Props = $props();

	const files = $derived(git?.changes?.files ?? []);
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

	{#if git?.upstream}
		<UpstreamStatus upstream={git.upstream} />
	{/if}

	<div class="scroller py-1.5">
		{#if !git}
			<p class="px-3.5 py-2 text-sm text-muted">Loading…</p>
		{:else if git.unavailable}
			<p class="px-3.5 py-2 text-sm text-muted">{git.unavailable}</p>
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
