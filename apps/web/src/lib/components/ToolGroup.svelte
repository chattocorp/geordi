<script lang="ts">
	import type { Part } from '#lib/transcript.ts';
	import ToolCall from './ToolCall.svelte';

	let { tools, cwd }: { tools: Extract<Part, { kind: 'tools' }>['tools']; cwd?: string } = $props();
</script>

<div
	class="divide-y divide-line/70 overflow-hidden rounded-xl bg-surface shadow-soft ring-1 ring-line/60"
>
	{#each tools as tool (tool.id)}
		<ToolCall {...tool} {cwd} />
	{/each}
</div>
