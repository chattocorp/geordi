<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import Panes from '#lib/ui/Panes.svelte';
	import { singleGroup, tabsOf, type Layout } from '#lib/layout.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import { closeTerminal } from '../../../routes/workspaces.remote';
	import Terminal from './Terminal.svelte';

	let { workspaceId }: { workspaceId: string } = $props();

	// Which terminals are open is remembered per browser; none until the user asks for one.
	// (`workspaceId` never changes: the page creates a new view per workspace.)
	// svelte-ignore state_referenced_locally
	const layout = persisted<Layout>(`geordi:terminals:${workspaceId}`, singleGroup([]));

	/** Terminals opened just now. Remembered ones only start again on a key press. */
	const requested = new SvelteSet<string>();

	function open() {
		const terminal = crypto.randomUUID().slice(0, 8);
		requested.add(terminal);
		return terminal;
	}

	function change(next: Layout) {
		const remaining = tabsOf(next);
		for (const terminal of tabsOf(layout.current))
			if (!remaining.includes(terminal)) closeTerminal({ workspaceId, terminal }).catch(() => {});
		layout.current = next;
	}
</script>

{#snippet tab(terminal: string)}
	<span class="icon-[lucide--square-terminal] size-3.5 shrink-0"></span>
	<span class="truncate">Terminal {tabsOf(layout.current).indexOf(terminal) + 1}</span>
{/snippet}

{#snippet window(terminal: string)}
	<Terminal {workspaceId} {terminal} start={requested.has(terminal)} />
{/snippet}

{#snippet empty()}
	<p>No terminal open. Start one with +.</p>
{/snippet}

<section class="flex min-h-0 flex-1 flex-col" aria-label="Terminals">
	<Panes
		layout={layout.current}
		onchange={change}
		{tab}
		{window}
		{empty}
		newTab={open}
		newLabel="New terminal"
	/>
</section>
