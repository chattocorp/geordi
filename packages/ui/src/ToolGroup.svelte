<script lang="ts">
	import Disclosure from './Disclosure.svelte';
	import { iconOf, titleOf } from './tools.ts';
	import type { ToolEntry } from './tools.ts';
	import type { ComponentProps, Snippet } from 'svelte';
	import ToolCall from './ToolCall.svelte';

	type Props = Pick<ComponentProps<typeof ToolCall>, 'workspace' | 'PatchView'> & {
		tools: ToolEntry[];
		open?: boolean;
		cursor?: Snippet;
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
		cursor,
		open = $bindable(false),
		backgroundIds = [],
		reveal
	}: Props = $props();

	const groupId = $props.id();

	/** The tool that is running right now, if one is: the only one worth watching. */
	const active = $derived(live ? tools.findLast((tool) => tool.output === null) : undefined);

	function activityOf(tool: ToolEntry) {
		if (tool.isError) return '';
		if (backgroundIds.includes(tool.id)) return 'running in the background';
		return tool === active ? 'running' : '';
	}
</script>

<!-- with room on both sides: it stands between what was said before and after -->
<!-- first in a reply, its row is centred on the avatar beside it -->
<Disclosure
	bind:open
	collapsedChevron={false}
	class="relative py-1 first:pt-0"
	summaryClass={open
		? 'absolute left-1 z-1 mt-1.5 size-7 text-muted hover:bg-hover hover:text-ink [&>span]:mx-auto'
		: 'min-h-7 text-sm text-muted'}
>
	{#snippet heading()}
		{#if open}
			<span class="sr-only">Collapse tool calls</span>
		{:else}
			<span class="sr-only">Tool calls</span>
			<span class="flex flex-wrap items-center gap-y-1 pe-1.5">
				{#each tools as tool, i (tool.id)}
					{@const activity = activityOf(tool)}
					{@const status = tool.isError ? 'failed' : activity}
					{@const title = titleOf(tool, cwd)
						.map((part) => part.text)
						.join('')}
					{@const label = title + (status ? ', ' + status : '')}
					<span
						role="img"
						aria-label={label}
						style:anchor-name="--{groupId}-{i}"
						data-live={activity ? true : undefined}
						class={[
							'tool-tile group/tile relative -me-1.5 grid size-6 shrink-0 place-items-center rounded-control bg-pane motion-safe:transition-opacity motion-safe:starting:opacity-0',
							activity && 'edge-live',
							tool.isError ? 'text-danger hover:bg-hover' : 'hover:text-ink'
						]}
					>
						<span class={['size-3.5 -translate-x-px', iconOf(tool)]}></span>
						<span
							role="tooltip"
							style:position-anchor="--{groupId}-{i}"
							style:position-area="top span-right"
							style:position-try-fallbacks="flip-inline, flip-block, flip-block flip-inline"
							class="pointer-events-none fixed z-10 my-1.5 hidden max-w-xs card-float px-2.5 py-1.5 text-xs text-ink group-hover/tile:block"
						>
							<span class="line-clamp-2 wrap-anywhere">{title}</span>
							{#if status}<span class="text-muted">{status}</span>{/if}
						</span>
					</span>
				{/each}
				{#if cursor}<span class="inline-flex not-first:ms-3.5">{@render cursor()}</span>{/if}
			</span>
		{/if}
	{/snippet}

	<div class="divide-y divide-line/70 overflow-hidden card">
		{#each tools as tool (tool.id)}
			<div
				class="pl-7"
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
{#if open && cursor}{@render cursor()}{/if}

<style>
	.tool-tile {
		--tile-outline: 1.5px;
		box-shadow: inset 0 0 0 var(--tile-outline) color-mix(in srgb, currentColor 25%, transparent);
	}

	.tool-tile[data-live]::before {
		inset: 0;
		padding: var(--tile-outline);
	}
</style>
