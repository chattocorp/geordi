<script lang="ts">
	import type { Snippet } from 'svelte';
	import PaneTabs from '@geordi/ui/PaneTabs.svelte';
	import {
		groupsOf,
		close,
		move,
		open,
		resize,
		type Group,
		type Layout,
		type Zone
	} from '#lib/layout.ts';
	import Button from '@geordi/ui/Button.svelte';
	import { drag, endDrag } from './drag.svelte.ts';
	import Split from './Split.svelte';

	type Props = {
		layout: Layout;
		onchange(layout: Layout): void;
		ondoubleclick?: (tab: string) => void;
		/** A tab's label. */
		tab: Snippet<[string]>;
		/** A tab's content. */
		window: Snippet<[string]>;
		/** Names the tab the "+" button of a group opens. Without it, there is no such button. */
		newTab?: () => string;
		/** Which tabs can be closed. All of them, unless said otherwise. */
		closable?: (tab: string) => boolean;
		/** Which tabs dragged over from another `Panes` may be dropped here. None, by default. */
		accepts?: (tab: string) => boolean;
		/**
		 * A tab from another `Panes` was dropped here: on a group (before one of its tabs, or
		 * `null` for after them all; not said if dropped on its window), or one of its sides.
		 */
		onreceive?: (tab: string, groupId: string, zone: Zone, before?: string | null) => void;
		/** Whether a tab dropped at the side of a group opens a new group there. It does, by default. */
		splits?: boolean;
		/** Label of the button that opens a new window. */
		newLabel?: string;
		/** Icon of that button (an Iconify class). */
		newIcon?: string;
		/** Shown in a group without tabs. Without it, such a group is simply empty. */
		empty?: Snippet;
		/**
		 * What can be done here beyond opening windows, at the far end of the bar. Where the
		 * panes are split, the first group's bar has it.
		 */
		actions?: Snippet;
	};
	let {
		layout,
		onchange,
		ondoubleclick,
		tab,
		window,
		newTab,
		closable = () => true,
		accepts = () => false,
		onreceive,
		splits = true,
		newLabel = 'New window',
		newIcon = 'icon-[lucide--plus]',
		empty,
		actions
	}: Props = $props();

	const uid = $props.id();

	/** Tells our own tabs from ones dragged over from another `Panes`. */
	const self = Symbol('panes');
	/** Where the dragged tab would land if dropped now. */
	let target = $state<{ group: string; zone: Zone; before?: string | null } | null>(null);
	const droppable = $derived(!!drag.tab && (drag.source === self || accepts(drag.tab)));
	// the drag ended, or moved on to another `Panes`
	$effect(() => {
		if (drag.over !== self) target = null;
	});

	/** Near an edge, a drop splits the group on that side; elsewhere it joins the group. */
	function zoneAt(event: DragEvent & { currentTarget: HTMLElement }): Zone {
		if (!splits) return 'center';
		const rect = event.currentTarget.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width;
		const y = (event.clientY - rect.top) / rect.height;
		if (x < 0.25) return 'left';
		if (x > 0.75) return 'right';
		if (y < 0.25) return 'top';
		if (y > 0.75) return 'bottom';
		return 'center';
	}

	function over(event: DragEvent, group: string, zone: Zone, before?: string | null) {
		if (!droppable) return;
		event.preventDefault();
		// a tab in the bar answers for itself, not the bar behind it
		event.stopPropagation();
		drag.over = self;
		if (target?.group !== group || target.zone !== zone || target.before !== before)
			target = { group, zone, before };
	}

	/** Over a tab in the bar: the dragged one goes before it, or after, by which half it is over. */
	function overTab(event: DragEvent & { currentTarget: HTMLElement }, group: Group, index: number) {
		const rect = event.currentTarget.getBoundingClientRect();
		const after = event.clientX > rect.left + rect.width / 2;
		over(event, group.id, 'center', group.tabs[index + (after ? 1 : 0)] ?? null);
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (drag.tab && target && droppable) {
			const { group, zone, before } = target;
			if (drag.source === self) onchange(move(layout, drag.tab, group, zone, before));
			else onreceive?.(drag.tab, group, zone, before);
		}
		endDrag();
	}

	const overlay: Record<Zone, string> = {
		center: 'inset-0',
		left: 'inset-y-0 left-0 w-1/2',
		right: 'inset-y-0 right-0 w-1/2',
		top: 'inset-x-0 top-0 h-1/2',
		bottom: 'inset-x-0 bottom-0 h-1/2'
	};
</script>

{#snippet node(n: Layout)}
	{#if n.kind === 'split'}
		<Split dir={n.dir} bind:ratio={() => n.ratio, (ratio) => onchange(resize(layout, n.id, ratio))}>
			{#snippet a()}{@render node(n.a)}{/snippet}
			{#snippet b()}{@render node(n.b)}{/snippet}
		</Split>
	{:else}
		<section class="flex min-h-0 min-w-0 flex-1 flex-col">
			{#snippet barActions()}
				{#if actions && groupsOf(layout)[0]?.id === n.id}{@render actions()}{/if}
				{#if newTab}
					<Button
						variant="ghost"
						size="sm"
						icon={newIcon}
						label={newLabel}
						onclick={() => onchange(open(layout, newTab(), n.id))}
					/>
				{/if}
			{/snippet}
			<PaneTabs
				prefix="{uid}-{n.id}"
				tabs={n.tabs}
				current={n.active}
				{tab}
				actions={newTab || (actions && groupsOf(layout)[0]?.id === n.id) ? barActions : undefined}
				{ondoubleclick}
				onselect={(id) => onchange(open(layout, id))}
				onclose={(id) => onchange(close(layout, id))}
				{closable}
				before={droppable && target?.group === n.id ? target.before : undefined}
				drag={{
					start(event, id) {
						drag.tab = id;
						drag.source = self;
						event.dataTransfer?.setData('text/plain', id);
					},
					end: endDrag,
					overTab: (event, index) => overTab(event, n, index),
					overBar: (event) => over(event, n.id, 'center', null),
					drop
				}}
			/>

			<div
				role="presentation"
				class="relative min-h-0 flex-1"
				ondragover={(event) => over(event, n.id, zoneAt(event))}
				ondrop={drop}
			>
				{#each n.tabs as id, index (id)}
					<div
						role="tabpanel"
						id="{uid}-{n.id}-panel-{index}"
						aria-labelledby="{uid}-{n.id}-tab-{index}"
						class={['absolute inset-0 flex flex-col', id !== n.active && 'invisible']}
					>
						{@render window(id)}
					</div>
				{:else}
					<div class="grid h-full place-items-center text-sm text-muted">
						{@render empty?.()}
					</div>
				{/each}
				{#if droppable && target?.group === n.id && target.before === undefined}
					<div
						class={[
							'pointer-events-none absolute z-20 rounded-control bg-accent/15 ring-2 ring-accent/60 ring-inset',
							overlay[target.zone]
						]}
					></div>
				{/if}
			</div>
		</section>
	{/if}
{/snippet}

{@render node(layout)}
