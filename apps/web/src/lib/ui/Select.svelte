<script lang="ts" module>
	export type SelectOption<T extends string = string> = {
		value: T;
		label: string;
		/** Other words to find it by, not shown. */
		keywords?: string;
	};
</script>

<script lang="ts" generics="T extends string">
	import { tick, type Snippet } from 'svelte';
	import { fuzzyFilter, fuzzySegments } from '#lib/fuzzy.ts';

	type Option = SelectOption<T>;
	type Props = {
		/** What is being chosen; read out, not shown. */
		label: string;
		value?: T;
		options: Option[];
		/** What the button says, instead of the chosen option's label. */
		trigger?: Snippet;
		/** Something before an option's label: an icon, an avatar. */
		icon?: Snippet<[Option]>;
	};
	let { label, value = $bindable(), options, trigger, icon }: Props = $props();

	const id = $props.id();
	let button: HTMLButtonElement;
	let popup: HTMLDivElement;
	let search: HTMLInputElement;

	let open = $state(false);
	let query = $state('');
	/** The option the keyboard is on: an index into `matches`. */
	let active = $state(0);
	/** Where the popup goes: under the button, or above it when there is no room below. */
	let place = $state('');

	const selected = $derived(options.find((option) => option.value === value) ?? options[0]);
	const matches = $derived(
		fuzzyFilter(
			query,
			options,
			(option) => option.label,
			(option) => option.keywords
		)
	);

	/** Roughly the popup's size at its largest, to decide where it fits. */
	const ROOM = { width: 320, height: 420 };

	function onbeforetoggle(event: ToggleEvent) {
		if (event.newState !== 'open') return;
		const from = button.getBoundingClientRect();
		const below = innerHeight - from.bottom;
		const left = Math.max(8, Math.min(from.left, innerWidth - ROOM.width - 8));
		place =
			`left: ${left}px; ` +
			(below < ROOM.height && from.top > below
				? `bottom: ${innerHeight - from.top + 6}px`
				: `top: ${from.bottom + 6}px`);
		query = '';
		active = Math.max(0, options.indexOf(selected));
	}

	async function ontoggle(event: ToggleEvent) {
		open = event.newState === 'open';
		if (!open) return;
		search.focus();
		await tick();
		reveal();
	}

	const reveal = () =>
		document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });

	function choose(option: Option) {
		value = option.value;
		popup.hidePopover();
		button.focus();
	}

	async function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + matches.length) % Math.max(1, matches.length);
			await tick();
			reveal();
		} else if (event.key === 'Enter') {
			// never the form's business
			event.preventDefault();
			const match = matches[active];
			if (match) choose(match.item);
		}
	}
</script>

<!-- The popup is placed once, when it opens: let go of it when the page changes shape. -->
<svelte:window onresize={() => open && popup.hidePopover()} />

<!--
	A choice among many: quiet text that opens a list to search. Type a few letters of what
	you want ("g6l" finds "GPT-6-Luna"); arrow keys and Enter pick.
-->
<button
	bind:this={button}
	type="button"
	popovertarget="{id}-popup"
	aria-haspopup="listbox"
	aria-expanded={open}
	aria-label="{label}: {selected?.label}"
	class={[
		'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-control px-2 text-sm hover:bg-sunken hover:text-ink',
		open ? 'bg-sunken text-ink' : 'text-muted'
	]}
>
	{#if trigger}{@render trigger()}{:else}{selected?.label}{/if}
	<span class="icon-[lucide--chevron-down] size-3.5 shrink-0"></span>
</button>

<div
	bind:this={popup}
	id="{id}-popup"
	popover="auto"
	{onbeforetoggle}
	{ontoggle}
	style="inset: auto; {place}"
	class="m-0 w-72 flex-col card-float p-1 text-ink open:flex"
>
	<label class="flex items-center gap-2 border-b border-line px-2 pt-1 pb-2 text-muted">
		<span class="icon-[lucide--search] size-3.5 shrink-0"></span>
		<input
			bind:this={search}
			bind:value={query}
			oninput={() => (active = 0)}
			{onkeydown}
			role="combobox"
			aria-label={label}
			aria-expanded={open}
			aria-controls="{id}-list"
			aria-activedescendant={matches[active] ? `${id}-${active}` : undefined}
			aria-autocomplete="list"
			autocomplete="off"
			spellcheck="false"
			placeholder="Search"
			class="w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-muted/70 focus-visible:outline-none"
		/>
	</label>
	<div id="{id}-list" role="listbox" aria-label={label} class="scroller max-h-72 py-1">
		{#each matches as { item, indices }, index (item.value)}
			<button
				type="button"
				role="option"
				id="{id}-{index}"
				tabindex="-1"
				aria-selected={item === selected}
				onclick={() => choose(item)}
				onpointermove={() => (active = index)}
				class={[
					'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm',
					index === active ? 'bg-sunken text-ink' : 'text-muted'
				]}
			>
				{@render icon?.(item)}
				<span class="min-w-0 flex-1 truncate">
					{#each fuzzySegments(item.label, indices) as segment, at (at)}
						{#if segment.hit}<mark class="bg-transparent font-semibold text-accent-ink"
								>{segment.text}</mark
							>{:else}{segment.text}{/if}
					{/each}
				</span>
				{#if item === selected}<span class="icon-[lucide--check] size-3.5 shrink-0"></span>{/if}
			</button>
		{:else}
			<p class="px-2 py-1.5 text-sm text-muted">Nothing like that</p>
		{/each}
	</div>
</div>
