<script lang="ts">
	import type { Agent } from '@geordi/protocol';
	import { agentName } from './agents.ts';

	type Props = {
		agent: Agent;
		size?: 'sm' | 'md';
		/** Just the agent's mark in its colour, without the tile: for tabs and other tight rows. */
		bare?: boolean;
	};
	const marks = {
		claude: { color: 'text-claude', background: 'bg-claude/15', icon: 'icon-[lucide--sparkles]' },
		codex: { color: 'text-codex', background: 'bg-codex/15', icon: 'icon-[lucide--code-xml]' },
		opencode: { color: 'text-ink', background: 'bg-hover', icon: 'icon-[lucide--square-terminal]' }
	} satisfies Record<Agent, { color: string; background: string; icon: string }>;
	let { agent, size = 'md', bare = false }: Props = $props();
</script>

<span
	class={[
		'grid shrink-0 place-items-center',
		!bare && ['rounded-control', size === 'sm' ? 'size-6' : 'size-8'],
		marks[agent].color,
		!bare && marks[agent].background
	]}
	title={agentName[agent]}
>
	<span class={[bare || size === 'sm' ? 'size-3.5' : 'size-4.5', marks[agent].icon]}></span>
	<span class="sr-only">{agentName[agent]}</span>
</span>
