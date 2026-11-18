<script lang="ts">
	import SubagentRow from './SubagentRow.svelte';
	import type { SubagentItem } from '#lib/server/workspaces.ts';
	import Disclosure from '#lib/ui/Disclosure.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import Markdown from './Markdown.svelte';
	import ToolCall from './ToolCall.svelte';
	let {
		child,
		cwd,
		pictures,
		onopen
	}: {
		child: SubagentItem;
		cwd?: string;
		pictures?: string;
		onopen?: (id: string) => void;
	} = $props();
	let open = $state(false);
	const labels = {
		running: 'Running',
		waiting: 'Waiting',
		done: 'Done',
		failed: 'Failed',
		stopped: 'Stopped',
		unknown: 'Status unknown'
	};
</script>

<Disclosure bind:open summaryClass="min-h-8 text-sm hover:text-ink">
	{#snippet heading()}
		<span class="icon-[lucide--git-branch] size-4 shrink-0 text-muted"></span>
		<span class="min-w-0 truncate font-medium">{child.title || 'Subagent'}</span>
		<span
			class={[
				'flex shrink-0 items-center gap-1 text-xs',
				child.state === 'failed' ? 'text-danger' : 'text-muted'
			]}
		>
			{#if child.state === 'running'}<span aria-hidden="true"><Spinner /></span>
			{/if}{labels[child.state]}
		</span>
	{/snippet}
	{#if open}
		<div class="ml-6 space-y-2 py-2">
			{#if onopen}<Button
					size="sm"
					variant="ghost"
					icon="icon-[lucide--panels-top-left]"
					onclick={() => onopen?.(child.id)}>Open in tab</Button
				>{/if}
			{#if child.description}<p class="text-xs text-muted">{child.description}</p>{/if}
			{#each child.items as entry (entry.kind + entry.id)}
				{#if entry.kind === 'subagent'}
					<SubagentRow child={entry} {cwd} {pictures} {onopen} />
				{:else if entry.kind === 'message'}
					{#if entry.text}
						<div class={entry.incoming ? 'message bg-bubble' : undefined}>
							<Markdown text={entry.text} preserveLineBreaks {pictures} />
						</div>
					{/if}
				{:else}
					<ToolCall {...entry} {cwd} running={child.state === 'running'} />
				{/if}
			{/each}
			{#if !child.items.length && !child.description}<p class="text-xs text-muted">
					No activity reported yet.
				</p>{/if}
		</div>
	{/if}
</Disclosure>
