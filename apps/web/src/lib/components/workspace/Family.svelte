<script lang="ts">
	import { resolve } from '$app/paths';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Relative = { id: string; title: string; status: 'idle' | 'running' };
	type Props = {
		/** The workspace whose agent started this one. */
		parent: Relative | null;
		/** Whether this one works in its parent's directory rather than one of its own. */
		sharesWorktree?: boolean;
	};
	let { parent, sharesWorktree = false }: Props = $props();
</script>

<!--
	Who started this workspace (FDR-002). The ones it started are not listed here: the
	sidebar shows them, indented under it.
-->
{#if parent}
	<div class="flex shrink-0 items-center gap-1.5 bg-frame px-5 py-1.5 text-xs text-muted">
		<span class="icon-[lucide--corner-down-right] size-3.5 shrink-0"></span>
		<span class="shrink-0">
			{sharesWorktree ? 'Started by, and working alongside' : 'Started by'}
		</span>
		<a
			href={resolve('/workspaces/[id]', { id: parent.id })}
			class="item max-w-64 gap-1.5 px-2 py-0.5 text-xs"
			title={parent.title}
		>
			{#if parent.status === 'running'}<Spinner />{:else}<span class="dot"></span>{/if}
			<span class="truncate">{parent.title}</span>
		</a>
	</div>
{/if}
