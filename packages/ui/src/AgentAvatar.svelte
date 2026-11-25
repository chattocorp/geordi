<script lang="ts">
	import type { Agent } from '@geordi/protocol';
	import { agentName } from './agents.ts';

	type Props = {
		agent: Agent;
		size?: 'sm' | 'md';
		/** Show just the mark. Use 'muted' for single-color metadata. */
		bare?: boolean | 'muted';
	};
	const marks = {
		claude: { color: 'text-claude', background: 'bg-claude/15', icon: 'icon-[lucide--sparkles]' },
		codex: { color: 'text-codex', background: 'bg-codex/15', icon: 'icon-[lucide--code-xml]' },
		opencode: { color: 'text-ink', background: 'bg-hover', icon: 'opencode-logo' }
	} satisfies Record<Agent, { color: string; background: string; icon: string }>;
	let { agent, size = 'md', bare = false }: Props = $props();
</script>

<span
	class={[
		'grid shrink-0 place-items-center',
		!bare && ['rounded-control', size === 'sm' ? 'size-6' : 'size-8'],
		bare === 'muted' ? 'text-muted' : marks[agent].color,
		!bare && marks[agent].background
	]}
	title={agentName[agent]}
>
	<span
		class={[
			agent === 'opencode' && !bare ? 'h-5 w-4' : bare || size === 'sm' ? 'size-3.5' : 'size-4.5',
			agent === 'opencode' && bare === 'muted' ? 'opencode-muted' : marks[agent].icon
		]}
	></span>
	<span class="sr-only">{agentName[agent]}</span>
</span>

<style>
	/* Official theme variants from https://opencode.ai/brand. */
	:global(.opencode-logo) {
		background: center / contain no-repeat url('./assets/opencode-light.svg');
	}
	:global(.dark .opencode-logo) {
		background-image: url('./assets/opencode-dark.svg');
	}
	.opencode-muted {
		background-color: currentColor;
		mask: center / contain no-repeat url('./assets/opencode-light.svg');
	}
</style>
