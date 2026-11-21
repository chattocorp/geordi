<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import Button from './Button.svelte';

	type Props = {
		/** Prefix for the matching panel IDs: prefix-panel-index. */
		prefix: string;
		tabs: string[];
		current: string | null;
		tab: Snippet<[string]>;
		actions?: Snippet;
		/** What comes before the tabs, at the start of the bar. */
		lead?: Snippet;
		onselect?: (id: string) => void;
		ondoubleclick?: (id: string) => void;
		onclose?: (id: string) => void;
		closable?: (id: string) => boolean;
		/** Drop marker: a tab ID, null for the end, or undefined to hide it. */
		before?: string | null;
		drag?: {
			start(event: DragEvent, id: string): void;
			end(): void;
			overBar(event: DragEvent): void;
			overTab(event: DragEvent & { currentTarget: HTMLElement }, index: number): void;
			drop(event: DragEvent): void;
		};
	};
	let {
		prefix,
		tabs,
		current,
		tab,
		actions,
		lead,
		onselect,
		ondoubleclick,
		onclose,
		closable,
		before,
		drag
	}: Props = $props();

	let list: HTMLElement | undefined = $state();
	let moreLeft = $state(false);
	let moreRight = $state(false);

	/** Fade the ends of the row where tabs continue beyond them. */
	function edges() {
		if (!list) return;
		const { scrollLeft, scrollWidth, clientWidth } = list;
		moreLeft = scrollLeft > 0;
		moreRight = scrollLeft + clientWidth < scrollWidth - 1;
	}

	$effect(() => {
		if (!list) return;
		const observer = new ResizeObserver(edges);
		observer.observe(list);
		return () => observer.disconnect();
	});

	// keep the current tab in sight when there are more than the bar can show
	$effect(() => {
		const index = current === null ? -1 : tabs.indexOf(current);
		list?.children[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		edges();
	});
</script>

<!-- Tabs scroll on their own; the actions beside them stay put, never over a tab. -->
<div class="pane-bar" role="presentation" ondragover={drag?.overBar} ondrop={drag?.drop}>
	{#if lead}
		<div class="flex shrink-0 items-center pl-2">
			{@render lead()}
		</div>
	{/if}
	<div
		role="tablist"
		tabindex="-1"
		bind:this={list}
		onscroll={edges}
		class={[
			'flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scroll-fade-x',
			lead ? 'pl-1' : 'pl-2',
			actions ? 'pr-1' : 'pr-2',
			moreLeft && 'more-left',
			moreRight && 'more-right'
		]}
	>
		{#each tabs as id, index (id)}
			{@const active = id === current}
			<!-- The tab and its close button are siblings: a tab can't hold another control. -->
			<div
				role="presentation"
				draggable={!!drag}
				transition:fade={{ duration: 120 }}
				ondragstart={(event) => drag?.start(event, id)}
				ondragend={drag?.end}
				ondragover={(event) => drag?.overTab(event, index)}
				ondrop={drag?.drop}
				onmousedown={(event) => {
					// the middle button closes; it is not for scrolling by here
					if (event.button === 1) event.preventDefault();
				}}
				onauxclick={(event) => {
					if (event.button !== 1 || !closable?.(id)) return;
					event.preventDefault();
					onclose?.(id);
				}}
				class={[
					// as much room before what it starts with as after what it ends with
					'group/tab item h-7 max-w-56 min-w-0 shrink-0 pl-2 select-none',
					// a button at the end sits as close to the edge as the tab's height leaves it
					closable?.(id) ? 'pr-1' : 'pr-2',
					active ? 'tab-active' : 'tab-inactive',
					// where the dragged tab would go: a line before this one, or after the last
					before === id && 'tab-drop-before',
					before === null && index === tabs.length - 1 && 'tab-drop-after'
				]}
			>
				<button
					type="button"
					role="tab"
					id="{prefix}-tab-{index}"
					aria-selected={active}
					aria-controls="{prefix}-panel-{index}"
					onclick={() => onselect?.(id)}
					ondblclick={() => ondoubleclick?.(id)}
					class="flex min-w-0 flex-1 items-center gap-2 self-stretch"
				>
					{@render tab(id)}
				</button>
				{#if closable?.(id)}
					<Button
						variant="ghost"
						size="sm"
						icon="icon-[lucide--x]"
						label="Close"
						onclick={() => onclose?.(id)}
						class={[
							'opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100',
							active && 'opacity-60'
						]}
					/>
				{/if}
			</div>
		{/each}
	</div>
	{#if actions}
		<div class="flex shrink-0 items-center gap-1 pr-2 pl-1">
			{@render actions()}
		</div>
	{/if}
</div>
