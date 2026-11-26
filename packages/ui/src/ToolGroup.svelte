<script lang="ts">
	import Disclosure from './Disclosure.svelte';
	import { iconOf, sortOf, titleOf } from './tools.ts';
	import type { ToolEntry } from './tools.ts';
	import type { ComponentProps } from 'svelte';
	import ToolCall from './ToolCall.svelte';
	import ToolTitle from './ToolTitle.svelte';

	type Props = Pick<ComponentProps<typeof ToolCall>, 'workspace' | 'PatchView'> & {
		tools: ToolEntry[];
		cwd?: string;
		/** Whether the agent is at work on this very group: its last tool may still be running. */
		live?: boolean;
		backgroundIds?: string[];
		reveal?: { id: string; done: () => void };
	};
	let {
		tools,
		cwd,
		workspace,
		PatchView,
		live = false,
		backgroundIds = [],
		reveal
	}: Props = $props();

	/** The tool that is running right now, if one is: the only one worth watching. */
	const active = $derived(live ? tools.findLast((tool) => tool.output === null) : undefined);

	function activityOf(tool: ToolEntry) {
		if (tool.isError) return '';
		if (backgroundIds.includes(tool.id)) return 'running in the background';
		return tool === active ? 'running' : '';
	}
</script>

<!--
	What an agent did between two things it said: a quiet line, since it is rarely what one
	came to read. While a tool runs, the line shows that tool. Afterwards it sums up what was
	used; a click shows each call, with its input and output.
-->
<!-- with room on both sides: it stands between what was said before and after -->
<!-- first in a reply, its row is centred on the avatar beside it -->
<Disclosure
	collapsedChevron={false}
	class="py-1 first:pt-0"
	summaryClass="min-h-7 text-sm text-muted hover:text-ink"
>
	{#snippet heading()}
		<span class="sr-only">Tool calls</span>
		<span class="flex flex-wrap items-center gap-1">
			{#each tools as tool (tool.id)}
				{@const activity = activityOf(tool)}
				{@const status = tool.isError ? 'failed' : activity}
				{@const label = sortOf(tool) + (status ? ', ' + status : '')}
				<span
					role="img"
					aria-label={label}
					title={label}
					data-live={activity ? true : undefined}
					class={[
						'grid size-6 shrink-0 place-items-center rounded-control border border-current/25 motion-safe:transition-opacity motion-safe:starting:opacity-0',
						activity && 'edge-live before:p-px',
						tool.isError && 'text-danger'
					]}
				>
					<span class={['size-3.5', iconOf(tool)]}></span>
				</span>
			{/each}
		</span>
		{#if active}<ToolTitle parts={titleOf(active, cwd)} />{/if}
	{/snippet}

	<div class="mt-1.5 divide-y divide-line/70 overflow-hidden card">
		{#each tools as tool (tool.id)}
			<div
				{@attach reveal?.id === tool.id
					? (node) => {
							const details = node.closest('details');
							const call = node.querySelector('details');
							if (details && call) {
								details.open = call.open = true;
								call.querySelector('summary')?.focus();
								reveal?.done();
							}
						}
					: undefined}
			>
				<ToolCall {...tool} {workspace} {PatchView} {cwd} running={!!activityOf(tool)} />
			</div>
		{/each}
	</div>
</Disclosure>
