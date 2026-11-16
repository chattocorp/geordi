<script lang="ts">
	import Spinner from '#lib/ui/Spinner.svelte';
	import type { WorktreeState } from '#lib/server/watchers.ts';
	import UpstreamStatus from './UpstreamStatus.svelte';

	type Props = {
		/**
		 * How the workspace's files and its pull request stand, kept up to date by the forge
		 * (see `getWorkspace`). `null` until first loaded.
		 */
		git: WorktreeState | null;
		/** The branch of a worktree that was removed outside Geordi, if that is what happened. */
		gone?: string | null;
		onopen(path: string): void;
	};
	let { git, gone = null, onopen }: Props = $props();

	const files = $derived(git?.changes?.files ?? []);

	type File = (typeof files)[number];
	const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);

	/** Git's letter for what became of a file, and what that means in words. */
	function flag(file: File): { letter: string; tone: string; means: string } {
		switch (file.status) {
			case 'added':
				return { letter: 'A', tone: 'text-ok', means: 'Added' };
			case 'deleted':
				return { letter: 'D', tone: 'text-danger', means: 'Deleted' };
			case 'renamed': {
				// the same name in another place is a move; Git calls both a rename
				const from = file.from ?? '';
				const moved = from.slice(dirOf(from).length) === file.path.slice(dirOf(file.path).length);
				return {
					letter: 'R',
					tone: 'text-muted',
					means: `${moved ? 'Moved' : 'Renamed'} from ${from}`
				};
			}
			default:
				return { letter: 'M', tone: 'text-muted', means: 'Modified' };
		}
	}
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
	{#if git?.upstream}
		<UpstreamStatus upstream={git.upstream} />
	{/if}

	<div class="scroller py-1.5">
		{#if gone}
			<!-- what happened, calmly; the way out is in the workspace's title bar -->
			<div class="space-y-1.5 px-3.5 py-2 text-sm text-muted">
				<p class="font-medium text-ink">The worktree was removed outside Geordi.</p>
				<p>
					Restoring it, or simply your next message, brings back everything committed on
					<span class="code-dense">{gone}</span>. Changes that weren't committed are gone.
				</p>
			</div>
		{:else if !git}
			<p class="flex items-center gap-2 px-3.5 py-2 text-sm text-muted">
				<Spinner label="Loading the changes" /> Loading…
			</p>
		{:else if git.unavailable}
			<p class="px-3.5 py-2 text-sm text-muted">{git.unavailable}</p>
		{:else}
			<ul>
				{#each files as file (file.path)}
					{@const slash = dirOf(file.path).length}
					{@const { letter, tone, means } = flag(file)}
					<li>
						<button
							type="button"
							onclick={() => onopen(file.path)}
							title="{means}: {file.path}"
							class="flex w-full items-center gap-2.5 px-3.5 py-1 text-left code-dense hover:bg-sunken"
						>
							<span class={['w-2 shrink-0 text-center font-semibold', tone]} aria-label={means}>
								{letter}
							</span>
							<span
								class={['min-w-0 flex-1 truncate', file.status === 'deleted' && 'line-through']}
							>
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
