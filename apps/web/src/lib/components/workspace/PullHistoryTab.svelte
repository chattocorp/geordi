<script lang="ts">
	import type { PullRequest } from '@geordi/protocol';
	import PullRequestTab from '@geordi/ui/PullRequestTab.svelte';

	let { pulls }: { pulls: PullRequest[] } = $props();
	const open = $derived(pulls.filter((pull) => pull.state === 'open').length);
	const label = $derived(
		pulls.some((pull) => pull.state === 'unknown')
			? 'Pull requests'
			: `Pull requests · ${open} open`
	);
</script>

{#if pulls.length === 1}
	<PullRequestTab pull={pulls[0]} />
{:else}
	<span class="icon-[lucide--git-pull-request] size-4 shrink-0"></span>
	<span>{label}</span>
{/if}
