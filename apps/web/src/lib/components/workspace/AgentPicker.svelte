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
		<label
			class="flex cursor-pointer items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm text-muted ring-1 ring-line has-checked:bg-sunken has-checked:text-ink has-checked:ring-ink/20 has-focus-visible:outline-2 has-focus-visible:outline-accent"
		>
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
