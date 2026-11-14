<script lang="ts">
	import type { Snippet } from 'svelte';
	import { close, move, open, resize, type Layout, type Zone } from '#lib/layout.ts';
	import Split from './Split.svelte';

	type Props = {
		layout: Layout;
		onchange(layout: Layout): void;
		/** A tab's label. */
		tab: Snippet<[string]>;
		/** A tab's content. */
		window: Snippet<[string]>;
		/** Names the tab the "+" button of a group opens. */
		newTab: () => string;
		/** Label of the "+" button. */
		newLabel?: string;
		/** Shown in a group without tabs. */
		empty?: Snippet;
	};
	let { layout, onchange, tab, window, newTab, newLabel = 'New window', empty }: Props = $props();

	/** The tab being dragged, and where it would land if dropped now. */
	let dragging = $state<string | null>(null);
	let target = $state<{ group: string; zone: Zone } | null>(null);

	/** Near an edge, a drop splits the group on that side; elsewhere it joins the group. */
	function zoneAt(event: DragEvent & { currentTarget: HTMLElement }): Zone {
		const rect = event.currentTarget.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width;
		const y = (event.clientY - rect.top) / rect.height;
		if (x < 0.25) return 'left';
		if (x > 0.75) return 'right';
		if (y < 0.25) return 'top';
		if (y > 0.75) return 'bottom';
		return 'center';
	}

	function over(event: DragEvent, group: string, zone: Zone) {
		if (!dragging) return;
		event.preventDefault();
		if (target?.group !== group || target.zone !== zone) target = { group, zone };
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		if (dragging && target) onchange(move(layout, dragging, target.group, target.zone));
		dragging = target = null;
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
			<div
				role="tablist"
				tabindex="-1"
				class="flex h-10 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-line bg-sidebar px-1.5"
				ondragover={(event) => over(event, n.id, 'center')}
				ondrop={drop}
			>
				{#each n.tabs as id (id)}
					{@const active = id === n.active}
					<div
						role="tab"
						tabindex="0"
						aria-selected={active}
						draggable="true"
						ondragstart={(event) => {
							dragging = id;
							event.dataTransfer?.setData('text/plain', id);
						}}
						ondragend={() => (dragging = target = null)}
						onclick={() => onchange(open(layout, id))}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') onchange(open(layout, id));
						}}
						class={[
							'group/tab flex h-8 max-w-56 min-w-0 shrink-0 cursor-default items-center gap-2 rounded-t-lg pr-1.5 pl-2.5 text-[13px] select-none',
							active
								? 'bg-bg font-medium text-ink shadow-[0_1px_0_var(--bg)] ring-1 ring-line'
								: 'text-muted hover:bg-surface/60 hover:text-ink'
						]}
					>
						{@render tab(id)}
						<button
							type="button"
							aria-label="Close"
							onclick={(event) => {
								event.stopPropagation();
								onchange(close(layout, id));
							}}
							class={[
								'grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-sunken hover:text-ink',
								!active && 'opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100'
							]}
						>
							<span class="icon-[lucide--x] size-3.5"></span>
						</button>
					</div>
				{/each}
				<button
					type="button"
					aria-label={newLabel}
					title={newLabel}
					onclick={() => onchange(open(layout, newTab(), n.id))}
					class="mb-1 ml-0.5 grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
				>
					<span class="icon-[lucide--plus] size-4"></span>
				</button>
			</div>

			<div
				role="presentation"
				class="relative min-h-0 flex-1"
				ondragover={(event) => over(event, n.id, zoneAt(event))}
				ondrop={drop}
			>
				{#each n.tabs as id (id)}
					<div
						role="tabpanel"
						class={['absolute inset-0 flex flex-col', id !== n.active && 'invisible']}
					>
						{@render window(id)}
					</div>
				{:else}
					<div class="grid h-full place-items-center text-sm text-muted">
						{#if empty}{@render empty()}{:else}Nothing open here.{/if}
					</div>
				{/each}
				{#if dragging && target?.group === n.id}
					<div
						class={[
							'pointer-events-none absolute z-20 rounded-lg bg-accent/15 ring-2 ring-accent/60 ring-inset',
							overlay[target.zone]
						]}
					></div>
				{/if}
			</div>
		</section>
	{/if}
{/snippet}

{@render node(layout)}
