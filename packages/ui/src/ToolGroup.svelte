<script lang="ts">
	import Disclosure from './Disclosure.svelte';
	import { iconOf, sortOf, titleOf } from './tools.ts';
	import type { ToolEntry } from './tools.ts';
	import type { ComponentProps } from 'svelte';
	import ProgressIcon from './ProgressIcon.svelte';
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

	/** What was used, each kind once, with how often: all there is to say once it is over. */
	const used = $derived(
		Object.values(
			tools.reduce<Record<string, { name: string; icon: string; count: number; failed: boolean }>>(
				(kinds, tool) => {
					const name = sortOf(tool);
					const kind = (kinds[name] ??= { name, icon: iconOf(tool), count: 0, failed: false });
					kind.count++;
					kind.failed ||= tool.isError;
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
<Disclosure class="py-1 first:pt-0" summaryClass="h-7 text-sm text-muted hover:text-ink">
	{#snippet heading()}
		{#if active}
			<span class={['size-3.5 shrink-0', iconOf(active)]}></span>
			<ToolTitle parts={titleOf(active, cwd)} />
			<ProgressIcon label="Running" />
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
				<ToolCall
					{...tool}
					{workspace}
					{PatchView}
					{cwd}
					running={backgroundIds.includes(tool.id) || (live && tool === active)}
				/>
			</div>
		{/each}
	</div>
</Disclosure>
