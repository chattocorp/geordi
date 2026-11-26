<script lang="ts">
	/**
	 * A row of the outline that is an item without a workspace (FDR-017): its text is what is
	 * read and edited, in place, like a line in any outliner. Its sign ticks it off, or, where
	 * items are folded under it, folds them. An archived workspace's item (`href`) is a done
	 * line that leads to its conversation, and is not edited here.
	 */
	let {
		id,
		text,
		done = false,
		href,
		fold,
		highlighted = false,
		dragging = false,
		onsave,
		ontoggle,
		onkeydown,
		onfocus,
		onblur
	}: {
		id: string;
		text: string;
		done?: boolean;
		href?: string;
		fold?: { folded: boolean; count: number; toggle(): void };
		highlighted?: boolean;
		dragging?: boolean;
		/** Called with its text when the line is left, where it changed. */
		onsave?: (text: string) => void;
		ontoggle?: () => void;
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
		onfocus?: () => void;
		onblur?: () => void;
	} = $props();

	const toggleLabel = $derived(done ? `Mark “${text}” as not done` : `Mark “${text}” as done`);
	const foldLabel = $derived(`${fold?.folded ? 'Expand' : 'Collapse'} ${text || 'item'}`);
</script>

<div
	class={[
		'group relative item gap-1 px-1 text-base',
		dragging && 'opacity-60',
		highlighted && 'bg-hover text-ink',
		done && 'text-faint'
	]}
>
	<span class="grid size-6 shrink-0 place-items-center text-muted">
		{#if fold}
			<button
				type="button"
				class="grid size-6 place-items-center rounded-control"
				aria-label={foldLabel}
				aria-expanded={!fold.folded}
				title={foldLabel}
				onclick={fold.toggle}
			>
				<span
					aria-hidden="true"
					class={[
						'icon-[lucide--chevron-right] size-4 transition-transform motion-reduce:transition-none',
						!fold.folded && 'rotate-90'
					]}
				></span>
			</button>
		{:else if href}
			<span class="icon-[lucide--circle-check] size-4 text-faint"></span>
		{:else}
			<button
				type="button"
				class="grid size-6 place-items-center rounded-control hover:text-ink"
				aria-label={toggleLabel}
				aria-pressed={done}
				title={toggleLabel}
				onclick={ontoggle}
			>
				<span
					aria-hidden="true"
					class={[
						'size-4',
						done ? 'icon-[lucide--circle-check] text-faint' : 'icon-[lucide--circle] text-faint'
					]}
				></span>
			</button>
		{/if}
	</span>
	{#if href}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolved URL -->
		<a {href} class="min-w-0 flex-1 truncate py-1 line-through" draggable="false">{text}</a>
	{:else}
		<input
			class={[
				'min-w-0 flex-1 bg-transparent py-1 outline-none placeholder:text-faint',
				done && 'line-through'
			]}
			value={text}
			placeholder="Write something"
			aria-label={text || 'New item'}
			data-item-input={id}
			draggable="false"
			{onfocus}
			onblur={(event) => {
				if (event.currentTarget.value !== text) onsave?.(event.currentTarget.value);
				onblur?.();
			}}
			{onkeydown}
		/>
	{/if}
	{#if fold?.folded}
		<span aria-hidden="true" class="shrink-0 pl-1 text-faint tabular-nums">{fold.count}</span>
	{/if}
</div>
