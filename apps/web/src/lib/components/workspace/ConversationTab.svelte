<script lang="ts">
	import type { Agent } from '@geordi/protocol';
	import AgentAvatar from '@geordi/ui/AgentAvatar.svelte';
	import { agentName } from '#lib/format.ts';
	import Spinner from '@geordi/ui/Spinner.svelte';

	let {
		agent,
		title = 'Conversation',
		subagent = false,
		waiting = false,
		running
	}: {
		agent: Agent;
		subagent?: boolean;
		waiting?: boolean;
		title?: string;
		running: boolean;
	} = $props();
</script>

<span class="grid size-3.5 shrink-0 place-items-center">
	{#if subagent}
		<span class="icon-[lucide--git-branch] size-3.5" role="img" aria-label="Subagent"></span>
	{:else if waiting}
		<span
			class="icon-[lucide--clock] size-3.5 text-muted"
			role="img"
			aria-label="Waiting for daemon"
		></span>
	{:else if running}
		<Spinner label={`${agentName[agent]} working`} />
	{:else}
		<AgentAvatar {agent} bare />
	{/if}
</span>
<span class="max-w-48 truncate" {title}>{title}</span>

{#if subagent && running}<Spinner label="Working" />{/if}
