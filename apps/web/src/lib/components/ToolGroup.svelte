<script lang="ts">
	import { toolIcon, toolSummary } from '#lib/tools.ts';
	import type { Part } from '#lib/transcript.ts';
	import Spinner from '#lib/ui/Spinner.svelte';
	import ToolCall from './ToolCall.svelte';

	type Props = {
		tools: Extract<Part, { kind: 'tools' }>['tools'];
		cwd?: string;
		/** Whether the agent is at work on this very group: its last tool may still be running. */
		live?: boolean;
	};
	let { tools, cwd, live = false }: Props = $props();

	/** The tool that is running right now, if one is: the only one worth watching. */
	const active = $derived(live ? tools.findLast((tool) => tool.output === null) : undefined);

	/** What was used, each kind once, with how often: all there is to say once it is over. */
	const used = $derived(
		Object.values(
			tools.reduce<Record<string, { name: string; icon: string; count: number; failed: boolean }>>(
				(kinds, { name, isError }) => {
					const kind = (kinds[name] ??= { name, icon: toolIcon(name), count: 0, failed: false });
					kind.count++;
					kind.failed ||= isError;
					return kinds;
				},
				{}
			)
		)
	);
</script>

<!--
	What an agent did between two things it said: a quiet line, since it is rarely what one
	came to read. While a tool runs, the line shows that tool. Afterwards it sums up what was
	used; a click shows each call, with its input and output.
-->
<!-- with room on both sides: it stands between what was said before and after -->
<!-- first in a reply, its row is centred on the avatar beside it -->
<details class="group/tools py-1 first:pt-0">
	<summary
		class="flex h-7 list-none items-center gap-2.5 rounded-control text-sm text-muted select-none hover:text-ink"
	>
		{#if active}
			<span class={['size-3.5 shrink-0', toolIcon(active.name)]}></span>
			<span class="shrink-0 font-medium">{active.name}</span>
			<span class="min-w-0 truncate code-dense">{toolSummary(active.input, cwd)}</span>
			<Spinner label="Running" />
		{:else}
			<!-- named, so that a row of small icons says what it is -->
			<span class="text-xs">Tools</span>
			{#each used as { name, icon, count, failed } (name)}
				<span class={['flex items-center gap-1', failed && 'text-danger']} title={name}>
					<span class={['size-3.5 shrink-0', icon]}></span>
					{#if count > 1}<span class="text-xs">{count}</span>{/if}
					<span class="sr-only">{name}{failed ? ', with failures' : ''}</span>
				</span>
			{/each}
		{/if}
		<span
			class="icon-[lucide--chevron-right] size-3.5 shrink-0 opacity-60 transition-transform group-open/tools:rotate-90 group-hover/tools:opacity-100"
		></span>
	</summary>

	<div class="mt-1.5 divide-y divide-line/70 overflow-hidden card">
		{#each tools as tool (tool.id)}
			<ToolCall {...tool} {cwd} running={live && tool === active} />
		{/each}
	</div>
</details>
