<script lang="ts">
	import { AGENTS, type Agent } from '@geordi/protocol';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import { agentName } from '#lib/format.ts';

	/** Radio inputs named `name`; spread `attributes(agent)` onto each for form libraries. */
	type Props = {
		value?: Agent;
		attributes?: (agent: Agent) => Record<string, unknown>;
	};
	let { value = $bindable('claude'), attributes }: Props = $props();
</script>

<fieldset class="flex gap-1.5">
	<legend class="sr-only">Agent</legend>
	{#each AGENTS as agent (agent)}
		<label class="choice">
			{#if attributes}
				<input {...attributes(agent)} class="sr-only" />
			{:else}
				<input type="radio" bind:group={value} value={agent} class="sr-only" />
			{/if}
			<AgentAvatar {agent} size="sm" />
			{agentName[agent]}
		</label>
	{/each}
</fieldset>
