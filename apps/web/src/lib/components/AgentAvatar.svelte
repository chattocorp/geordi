<script lang="ts">
	import type { Agent } from '@geordi/protocol';
	import { agentName } from '#lib/format.ts';

	let { agent, size = 'md' }: { agent: Agent; size?: 'sm' | 'md' } = $props();
</script>

<span
	class={[
		'grid shrink-0 place-items-center rounded-control',
		size === 'sm' ? 'size-6' : 'size-8',
		agent === 'claude' ? 'bg-claude/15 text-claude' : 'bg-codex/15 text-codex'
	]}
	title={agentName[agent]}
>
	<span
		class={[
			size === 'sm' ? 'size-3.5' : 'size-4.5',
			agent === 'claude' ? 'icon-[lucide--sparkles]' : 'icon-[lucide--code-xml]'
		]}
	></span>
	<span class="sr-only">{agentName[agent]}</span>
</span>
