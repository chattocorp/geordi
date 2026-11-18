<script lang="ts">
	import type { PullRequest } from '@geordi/protocol';
	import ChecksRing from '#lib/components/ChecksRing.svelte';

	let { pulls }: { pulls: PullRequest[] } = $props();
	const single = $derived(pulls.length === 1 ? pulls[0] : null);
	const open = $derived(pulls.filter((pull) => pull.state === 'open').length);
	const label = $derived(
		single
			? '#' + single.number
			: pulls.some((pull) => pull.state === 'unknown')
				? 'Pull requests'
				: `Pull requests · ${open} open`
	);
</script>

{#if single?.checks?.state === 'pending' || single?.checks?.counts?.pending}
	<ChecksRing counts={single.checks.counts} />
{:else}
	<span class="icon-[lucide--git-pull-request] size-4 shrink-0"></span>
{/if}
<span>{label}</span>
