<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import Keys from '@geordi/ui/Keys.svelte';
	import { fuzzyFilter, fuzzySegments } from '#lib/fuzzy.ts';
	import Dialog from './Dialog.svelte';
	import type { Command } from '#lib/commands.ts';

	type Props = {
		/** Whether it is showing. Escape and a click beside it close it. */
		open: boolean;
		/** What it is for, for those who can't see it. */
		label: string;
		/**
		 * What can be done, in the order to list them; grouped by `group`, in order of first
		 * appearance. Those `unlisted` are left out.
		 */
		items: Command[];
		placeholder?: string;
		/** Draws the picture of an item's repository (`repo`), in place of its icon. */
		picture?: Snippet<[NonNullable<Command['repo']>]>;
	};
	let { open = $bindable(), label, items, placeholder = 'Search', picture }: Props = $props();

	const id = $props.id();
	let search = $state<HTMLInputElement>();
	let query = $state('');
	const matches = $derived(
		fuzzyFilter(
			query,
			items.filter((item) => !item.unlisted),
			(item) => item.label,
			(item) => [item.group, item.detail, item.keywords].filter(Boolean).join(' ')
		)
	);
	/** The item the keyboard is on, by its ID: the list may change while it is open. */
	let chosen = $state<string>();
	/** Where that is in `matches`; the first, until one is chosen. */
	const active = $derived(
		Math.max(
			0,
			matches.findIndex((match) => match.item.id === chosen)
		)
	);
	const select = (index: number) => (chosen = matches[index]?.item.id);
	/** While nothing is typed, everything under its heading; once something is, the best first. */
	const grouped = $derived(!query.trim());

	function onopen() {
		query = '';
		chosen = undefined;
		search?.focus();
	}

	const reveal = () =>
		document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });

	async function choose(item: Command) {
		// closed first, so that what it does may take the focus
		open = false;
		await tick();
		item.run();
	}

	async function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			select((active + step + matches.length) % Math.max(1, matches.length));
			await tick();
			reveal();
		} else if (event.key === 'Enter' && !event.isComposing) {
			event.preventDefault();
			const match = matches[active];
			if (match) void choose(match.item);
		}
	}
</script>

<!--
	Everything that can be done here, to search: type a few letters of it, arrow keys and
	Enter pick. Stays at the same height while the list below it changes.
-->
<Dialog bind:open {label} {onopen} class="mt-24 mb-auto max-w-xl">
	<div class="flex flex-col p-2">
		<label class="flex items-center gap-2 px-2 pt-1 pb-2 text-muted">
			<span class="icon-[lucide--search] size-4 shrink-0"></span>
			<input
				bind:this={search}
				bind:value={query}
				oninput={() => (chosen = undefined)}
				{onkeydown}
				role="combobox"
				aria-label={label}
				aria-expanded="true"
				aria-controls="{id}-list"
				aria-activedescendant={matches[active] ? `${id}-${active}` : undefined}
				aria-autocomplete="list"
				autocomplete="off"
				spellcheck="false"
				{placeholder}
				class="w-full min-w-0 bg-transparent text-base text-ink placeholder:text-faint focus-visible:outline-none"
			/>
		</label>
		<div id="{id}-list" role="listbox" aria-label={label} class="scroller max-h-96 min-h-0">
			{#each matches as { item, indices }, index (item.id)}
				{#if grouped && item.group !== matches[index - 1]?.item.group}
					<p class="px-2 pt-3 pb-1 label" role="presentation">{item.group}</p>
				{/if}
				<button
					type="button"
					role="option"
					id="{id}-{index}"
					tabindex="-1"
					aria-selected={index === active}
					onclick={() => choose(item)}
					onpointermove={() => select(index)}
					class={['menu-item', index === active && 'item-picked']}
				>
					{#if picture && item.repo}
						{@render picture(item.repo)}
					{:else}
						<span class={['size-4 shrink-0', item.icon ?? 'icon-[lucide--chevron-right]']}></span>
					{/if}
					<span class="min-w-0 flex-1 truncate">
						{#each fuzzySegments(item.label, indices) as segment, at (at)}
							{#if segment.hit}<mark class="bg-transparent font-semibold text-accent-ink">
									{segment.text}
								</mark>{:else}{segment.text}{/if}
						{/each}
					</span>
					{#if item.detail || !grouped}
						<span class="max-w-1/2 shrink-0 truncate text-xs text-muted">
							{item.detail ?? item.group}
						</span>
					{/if}
					{#if item.shortcut}<Keys id={item.shortcut} />{/if}
				</button>
			{:else}
				<p class="px-2 py-1.5 text-sm text-muted">Nothing like that</p>
			{/each}
		</div>
	</div>
</Dialog>
