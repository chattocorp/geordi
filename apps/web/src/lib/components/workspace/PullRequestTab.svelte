<script lang="ts">
	import type { PullRequest } from '@geordi/protocol';
	import ChecksRing from '#lib/components/ChecksRing.svelte';

	let { pull }: { pull: PullRequest } = $props();
</script>

{#if pull.checks?.state === 'pending' || pull.checks?.counts?.pending}
	<ChecksRing counts={pull.checks.counts} />
{:else}
	<span class="icon-[lucide--git-pull-request] size-4 shrink-0"></span>
{/if}
<span>#{pull.number}</span>
