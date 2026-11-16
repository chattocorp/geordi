<script lang="ts">
	import type { Agent } from '@geordi/protocol';
	import { agentName } from '#lib/format.ts';

	type Props = {
		agent: Agent;
		size?: 'sm' | 'md';
		/** Just the agent's mark in its colour, without the tile: for tabs and other tight rows. */
		bare?: boolean;
	};
	let { agent, size = 'md', bare = false }: Props = $props();
</script>

<span
	class={[
		'grid shrink-0 place-items-center',
		!bare && ['rounded-control', size === 'sm' ? 'size-6' : 'size-8'],
		agent === 'claude' ? 'text-claude' : 'text-codex',
		!bare && (agent === 'claude' ? 'bg-claude/15' : 'bg-codex/15')
	]}
	title={agentName[agent]}
>
	<span
		class={[
			bare || size === 'sm' ? 'size-3.5' : 'size-4.5',
			agent === 'claude' ? 'icon-[lucide--sparkles]' : 'icon-[lucide--code-xml]'
		]}
	></span>
	<span class="sr-only">{agentName[agent]}</span>
</span>
