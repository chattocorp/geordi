<script lang="ts">
	import { AGENTS, type Agent, type Harness } from '@geordi/protocol';
	import AgentAvatar from '@geordi/ui/AgentAvatar.svelte';
	import Segmented from '@geordi/ui/Segmented.svelte';
	import { agentName } from '#lib/format.ts';

	let {
		harnesses,
		active,
		identifyClaude,
		onidentify
	}: {
		harnesses: Harness[] | null | undefined;
		active: Agent[];
		/** Whether Claude Code is told that Geordi started it; unknown while loading. */
		identifyClaude?: boolean;
		onidentify?: (on: boolean) => void;
	} = $props();
</script>

<h2 class="heading">Providers</h2>
<p class="pb-4 text-sm text-muted">
	{#if harnesses === null}
		Daemon offline. Provider status is unknown.
	{:else if harnesses === undefined}
		Checking provider status…
	{:else}
		Geordi checks for these programs when the daemon connects.
	{/if}
</p>
<ul class="card p-2">
	{#each AGENTS as agent (agent)}
		{@const available = harnesses?.some((offer) => offer.agent === agent)}
		{@const turns = active.filter((kind) => kind === agent).length}
		<li class="flex flex-wrap items-center gap-3 px-2 py-2">
			<span aria-hidden="true"><AgentAvatar {agent} /></span>
			<div class="flex-1">
				<p class="text-sm font-medium">{agentName[agent]}</p>
				<p class="text-xs text-muted">
					{!harnesses ? 'Unknown' : available ? 'Available' : 'Executable not found'}
				</p>
			</div>
			{#if harnesses && (available || turns)}
				<span class={['text-sm', turns ? 'text-accent-ink' : 'text-muted']}>
					{turns ? `${turns} active ${turns === 1 ? 'turn' : 'turns'}` : 'Idle'}
				</span>
			{/if}
		</li>
	{/each}
</ul>
{#if identifyClaude !== undefined && onidentify}
	<div class="flex items-center justify-between gap-4 pt-6">
		<div>
			<p class="text-sm font-medium">Identify Geordi to Claude Code</p>
			<p class="text-sm text-muted">
				Experimental. Claude Code sessions identify Geordi as their client.
			</p>
		</div>
		<Segmented
			label="Identify Geordi to Claude Code"
			bind:value={() => (identifyClaude ? 'on' : 'off'), (value) => onidentify(value === 'on')}
			options={[
				{ value: 'on', label: 'On' },
				{ value: 'off', label: 'Off' }
			]}
		/>
	</div>
{/if}
