<script lang="ts">
	import { resolve } from '$app/paths';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Relative = { id: string; title: string; status: 'idle' | 'running' };
	type Props = {
		/** The workspace whose agent started this one. */
		parent: Relative | null;
		/** Whether this one works in its parent's directory rather than one of its own. */
		sharesWorktree?: boolean;
		/** The workspaces this one's agent started. */
		children: Relative[];
	};
	let { parent, sharesWorktree = false, children }: Props = $props();
</script>

{#snippet relative({ id, title, status }: Relative)}
	<a
		href={resolve('/workspaces/[id]', { id })}
		class="item max-w-64 gap-1.5 px-2 py-0.5 text-xs"
		{title}
	>
		{#if status === 'running'}<Spinner />{:else}<span class="dot"></span>{/if}
		<span class="truncate">{title}</span>
	</a>
{/snippet}

<!--
	Who started whom (FDR-002): the workspace whose agent started this one, and the ones its
	own agent started. Not there for a workspace that has neither.
-->
{#if parent || children.length > 0}
	<div
		class="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-line bg-sidebar px-5 py-1.5 text-xs text-muted"
	>
		{#if parent}
			<div class="flex min-w-0 items-center gap-1.5">
				<span class="icon-[lucide--corner-down-right] size-3.5 shrink-0"></span>
				<span class="shrink-0">
					{sharesWorktree ? 'Started by, and working alongside' : 'Started by'}
				</span>
				{@render relative(parent)}
			</div>
		{/if}
		{#if children.length > 0}
			<div class="flex min-w-0 flex-wrap items-center gap-1.5">
				<span class="icon-[lucide--split] size-3.5 shrink-0 rotate-90"></span>
				<span class="shrink-0">Agents it started</span>
				{#each children as child (child.id)}{@render relative(child)}{/each}
			</div>
		{/if}
	</div>
{/if}
