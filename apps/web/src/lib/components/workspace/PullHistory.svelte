<script lang="ts">
	import type { PullRequest } from '@geordi/protocol';
	import PullRequestPane from '@geordi/ui/PullRequestPane.svelte';
	import Markdown from '#lib/components/Markdown.svelte';

	let {
		pulls,
		current,
		selected = $bindable(null)
	}: {
		pulls: PullRequest[];
		current?: string | null;
		selected?: string | null;
	} = $props();

	const detail = $derived(
		pulls.length === 1 ? pulls[0] : pulls.find((pull) => (pull.url ?? pull.number) === selected)
	);
</script>

{#if detail}
	{#if pulls.length > 1}
		<button class="m-2 menu-item self-start" onclick={() => (selected = null)}>
			<span class="icon-[lucide--arrow-left] size-4"></span>Pull requests
		</button>
	{/if}
	<PullRequestPane pull={detail}>
		{#snippet description(text: string)}<Markdown {text} />{/snippet}
	</PullRequestPane>
{:else}
	<section class="scroller p-2" aria-label="Workspace pull requests">
		{#each pulls as pull (pull.url ?? pull.number)}
			<button
				class="item w-full flex-col items-start gap-1 px-2 py-2 text-left"
				onclick={() => (selected = pull.url ?? pull.number)}
			>
				<span class="text-sm font-medium wrap-anywhere text-ink">{pull.title}</span>
				<span class="flex flex-wrap items-center gap-2 text-xs text-muted">
					<span>#{pull.number}</span>
					<span class={pull.state === 'open' ? 'text-accent-ink' : undefined}>
						{pull.state === 'unknown'
							? 'Status unavailable'
							: pull.draft && pull.state === 'open'
								? 'Draft'
								: pull.state[0].toUpperCase() + pull.state.slice(1)}
					</span>
					{#if current && pull.url === current}<span>Current branch</span>{/if}
				</span>
			</button>
		{/each}
	</section>
{/if}
