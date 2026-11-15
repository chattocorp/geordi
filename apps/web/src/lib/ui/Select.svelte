<script lang="ts" generics="T extends string">
	import { tick, type Snippet } from 'svelte';
	import { fuzzyFilter, fuzzySegments } from '#lib/fuzzy.ts';

	type Option = {
		value: T;
		label: string;
		/** Something to tell similar options apart, or to find one by: an ID, say. */
		hint?: string;
	};
	type Props = {
		/** What is being chosen: shown while the default is, and the placeholder of the search. */
		label: string;
		value?: T;
		/** The first option is the default: while it is chosen, the select is muted and shows `label`. */
		options: Option[];
		/** Something before the text: an icon, a meter. */
		leading?: Snippet;
	};
	let { label, value = $bindable(), options, leading }: Props = $props();

	const id = $props.id();
	let trigger: HTMLButtonElement;
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
			(option) => option.hint
		)
	);

	/** Roughly the popup's size at its largest, to decide where it fits. */
	const ROOM = { width: 320, height: 340 };

	function onbeforetoggle(event: ToggleEvent) {
		if (event.newState !== 'open') return;
		const button = trigger.getBoundingClientRect();
		const below = innerHeight - button.bottom;
		const left = Math.max(8, Math.min(button.left, innerWidth - ROOM.width - 8));
		place =
			`left: ${left}px; min-width: ${button.width}px; ` +
			(below < ROOM.height && button.top > below
				? `bottom: ${innerHeight - button.top + 6}px`
				: `top: ${button.bottom + 6}px`);
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
		trigger.focus();
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
		} else if (event.key === 'Tab') {
			popup.hidePopover();
		}
	}
</script>

<!-- The popup is placed once, when it opens: let go of it when the page changes shape. -->
<svelte:window onresize={() => open && popup.hidePopover()} />

<!--
	A choice among many, as a quiet pill that opens a list to search: type a few letters of
	what you want ("g6l" finds "GPT-6-Luna"), arrow keys and Enter pick. While its first
	option, the default, is chosen, it is muted and just says what it is for.
-->
<button
	bind:this={trigger}
	type="button"
	popovertarget="{id}-popup"
	aria-haspopup="listbox"
	aria-expanded={open}
	aria-label="{label}: {selected?.label}"
	class={[
		'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-2 pl-3 text-sm ring-1 ring-line',
		selected === options[0] ? 'text-muted' : 'bg-sunken text-ink ring-ink/20'
	]}
>
	{@render leading?.()}
	{selected === options[0] ? label : selected?.label}
	<span class="icon-[lucide--chevron-down] size-3.5 text-muted"></span>
</button>

<div
	bind:this={popup}
	id="{id}-popup"
	popover="auto"
	{onbeforetoggle}
	{ontoggle}
	style="inset: auto; {place}"
	class="m-0 max-w-80 flex-col card-float p-1 text-ink open:flex"
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
			placeholder={label}
			class="w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-muted/70 focus-visible:outline-none"
		/>
	</label>
	<div id="{id}-list" role="listbox" aria-label={label} class="scroller max-h-72 pt-1">
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
				<span class={['icon-[lucide--check] size-3.5 shrink-0', item !== selected && 'invisible']}
				></span>
				<span class="whitespace-nowrap">
					{#each fuzzySegments(item.label, indices) as segment, at (at)}
						{#if segment.hit}<mark class="bg-transparent font-semibold text-accent-ink"
								>{segment.text}</mark
							>{:else}{segment.text}{/if}
					{/each}
				</span>
				{#if item.hint}
					<span class="ml-auto pl-4 code-dense whitespace-nowrap text-muted">{item.hint}</span>
				{/if}
			</button>
		{:else}
			<p class="px-2 py-1.5 text-sm text-muted">Nothing like that</p>
		{/each}
	</div>
</div>
