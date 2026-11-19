<script lang="ts">
	import type { PullRequest } from '@geordi/protocol';
	import { describeChecks } from '@geordi/ui/checks';
	import Ring from '@geordi/ui/Ring.svelte';

	let { pull }: { pull: PullRequest } = $props();
	const summary = $derived(pull.checks && describeChecks(pull.checks));
</script>

<span class="icon-[lucide--git-pull-request] size-4 shrink-0"></span>
<span>#{pull.number}</span>
{#if summary}
	<Ring label="Checks: {summary.text}" parts={summary.parts} />
{/if}
