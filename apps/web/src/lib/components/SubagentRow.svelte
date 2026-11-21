<script lang="ts">
	import SubagentRow from './SubagentRow.svelte';
	import type { SubagentItem } from '#lib/server/workspaces.ts';
	import Disclosure from '@geordi/ui/Disclosure.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import Spinner from '@geordi/ui/Spinner.svelte';
	import { isBrowserCompletion } from '#lib/agent-directives.ts';
	import Markdown from './Markdown.svelte';
	import PatchView from './PatchView.svelte';
	import { changedFiles } from '#lib/changedFiles.ts';
	import ToolCall from '@geordi/ui/ToolCall.svelte';
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
	const workspaceFiles = changedFiles();
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

<Disclosure
	class="relative"
	bind:open
	summaryClass={`min-h-8 text-sm hover:text-ink ${open && onopen ? 'mr-8' : ''}`}
>
	{#snippet heading()}
		<span class="icon-[lucide--git-branch] size-4 shrink-0 text-muted"></span>
		<span class="min-w-0 truncate font-medium">{child.title || 'Subagent'}</span>
		<span
			class={[
				'flex shrink-0 items-center gap-1 text-xs',
				child.state === 'failed' ? 'text-danger' : 'text-muted'
			]}
		>
			{#if child.state === 'running'}<span class="flex" aria-hidden="true"><Spinner /></span>
			{/if}{labels[child.state]}
		</span>
	{/snippet}
	{#if open && onopen}
		<Button
			class="absolute top-1 right-0"
			size="sm"
			variant="ghost"
			icon="icon-[lucide--external-link]"
			label="Open in tab"
			onclick={() => onopen?.(child.id)}
		/>
	{/if}
	{#if open}
		<div class="ml-6 space-y-2 py-2">
			{#if child.description}<p class="text-xs text-muted">{child.description}</p>{/if}
			{#each child.items as entry (entry.kind + entry.id)}
				{#if entry.kind === 'subagent'}
					<SubagentRow child={entry} {cwd} {pictures} {onopen} />
				{:else if entry.kind === 'message'}
					{#if entry.text && (entry.incoming || !isBrowserCompletion(entry.text))}
						<div class={entry.incoming ? 'message bg-bubble' : undefined}>
							<Markdown
								agentDirectives={!entry.incoming}
								text={entry.text}
								preserveLineBreaks
								{pictures}
							/>
						</div>
					{/if}
				{:else}
					<ToolCall
						{...entry}
						{PatchView}
						workspace={workspaceFiles}
						{cwd}
						running={child.state === 'running'}
					/>
				{/if}
			{/each}
			{#if !child.items.length && !child.description}<p class="text-xs text-muted">
					No activity reported yet.
				</p>{/if}
		</div>
	{/if}
</Disclosure>
