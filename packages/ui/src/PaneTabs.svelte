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
		onselect?: (id: string) => void;
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
	let { prefix, tabs, current, tab, actions, onselect, onclose, closable, before, drag }: Props =
		$props();
</script>

<div
	role="tablist"
	tabindex="-1"
	class="pane-bar gap-1 overflow-x-auto px-2"
	ondragover={drag?.overBar}
	ondrop={drag?.drop}
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
	{#if actions}
		<div class="sticky right-0 ml-auto flex shrink-0 items-center gap-1 bg-pane pl-2">
			{@render actions()}
		</div>
	{/if}
</div>
