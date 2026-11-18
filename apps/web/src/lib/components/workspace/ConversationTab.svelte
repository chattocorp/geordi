<script lang="ts">
	import type { Agent } from '@geordi/protocol';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';

	let {
		agent,
		title = 'Conversation',
		running
	}: { agent: Agent; title?: string; running: boolean } = $props();
</script>

<AgentAvatar {agent} bare />
<span class="max-w-48 truncate" {title}>{title}</span>
{#if running}<Spinner />{/if}
