<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { add, prune, singleGroup, tabsOf, type Layout } from '#lib/layout.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import Panes from '#lib/ui/Panes.svelte';
	import { closeTerminal } from '../../../routes/workspaces.remote';
	import Terminal from './Terminal.svelte';

	type Props = {
		workspaceId: string;
		/** The workspace's terminals whose shells are running. */
		running: string[];
	};
	let { workspaceId, running }: Props = $props();

	// Only how the terminals are arranged is remembered, per browser.
	// (`workspaceId` never changes: the page creates a new view per workspace.)
	// svelte-ignore state_referenced_locally
	const arrangement = persisted<Layout>(`geordi:terminals:${workspaceId}`, singleGroup([]));

	/** Terminals asked for just now, whose shells are still starting. */
	const starting = new SvelteSet<string>();
	$effect(() => {
		for (const terminal of starting) if (running.includes(terminal)) starting.delete(terminal);
	});

	// There is a tab for every running shell and for none that isn't: a remembered tab whose
	// shell is gone (it exited, or the daemon restarted) simply isn't there any more.
	const layout = $derived(
		running.reduce(
			add,
			prune(arrangement.current, (tab) => running.includes(tab) || starting.has(tab))
		)
	);

	function open() {
		const terminal = crypto.randomUUID().slice(0, 8);
		starting.add(terminal);
		return terminal;
	}

	function change(next: Layout) {
		const remaining = tabsOf(next);
		for (const terminal of tabsOf(layout))
			if (!remaining.includes(terminal)) {
				starting.delete(terminal);
				closeTerminal({ workspaceId, terminal }).catch(() => {});
			}
		arrangement.current = next;
	}
</script>

{#snippet tab(terminal: string)}
	<span class="icon-[lucide--square-terminal] size-3.5 shrink-0"></span>
	<span class="truncate">Terminal {tabsOf(layout).indexOf(terminal) + 1}</span>
{/snippet}

{#snippet window(terminal: string)}
	<Terminal {workspaceId} {terminal} start={starting.has(terminal)} />
{/snippet}

{#snippet empty()}
	<p>No terminal open. Start one with +.</p>
{/snippet}

<section class="flex min-h-0 flex-1 flex-col" aria-label="Terminals">
	<Panes {layout} onchange={change} {tab} {window} {empty} newTab={open} newLabel="New terminal" />
</section>
