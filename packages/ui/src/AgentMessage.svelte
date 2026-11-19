<script lang="ts">
	import type { Agent } from '@geordi/protocol';
	import type { Snippet } from 'svelte';
	import AgentAvatar from './AgentAvatar.svelte';
	let { agent, children }: { agent: Agent; children: Snippet } = $props();
</script>

<div class="group/reply flex gap-3.5">
	<AgentAvatar {agent} />
	<div class="min-w-0 flex-1 space-y-3 pt-0.5">{@render children()}</div>
</div>
