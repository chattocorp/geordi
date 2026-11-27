<script lang="ts">
	/**
	 * A row of the outline that is an item without a workspace (FDR-019): its text is what is
	 * read and edited, in place, like a line in any outliner, and wraps where it is long. Its
	 * sign ticks it off; what is under it folds, and it is zoomed into, from beside that (the
	 * outline's gutter, as in Workflowy). An archived workspace's
	 * item (`href`) is a done line that leads to its conversation, and is not edited here.
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
		onkeydown
	}: {
		id: string;
		text: string;
		done?: boolean;
		href?: string;
		/** What is folded under it: folded, how many there are is said after its text. */
		fold?: { folded: boolean; count: number; toggle(): void };
		highlighted?: boolean;
		dragging?: boolean;
		/** Called with its text when the line is left, where it changed. */
		onsave?: (text: string) => void;
		ontoggle?: () => void;
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => void;
	} = $props();

	/**
	 * Whether it was ticked off just now: a line is then drawn through its text (`strike-draw`)
	 * before it is crossed out as what is done always is. Not when it shows done to begin with.
	 */
	let striking = $state(false);
	// svelte-ignore state_referenced_locally
	let wasDone = done;
	$effect.pre(() => {
		if (done && !wasDone) {
			striking = true;
			const settle = setTimeout(() => (striking = false), 360);
			wasDone = done;
			return () => clearTimeout(settle);
		}
		wasDone = done;
	});
	const toggleLabel = $derived(done ? `Mark “${text}” as not done` : `Mark “${text}” as done`);
</script>

<div
	class={[
		'group relative item gap-1 px-1 text-base',
		dragging && 'opacity-60',
		highlighted && 'bg-hover text-ink',
		done && 'text-faint'
	]}
>
	<!-- a long line wraps: what is beside it stays level with its first line -->
	<span class="mt-1 grid size-6 shrink-0 place-items-center self-start text-muted">
		{#if href}
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
		<a {href} class="min-w-0 flex-1 py-1 break-words line-through" draggable="false">{text}</a>
	{:else}
		<!-- one line of text, as long as it is: it wraps, and grows to fit (`field-sizing`) -->
		<span class="relative flex min-w-0 flex-1">
			<textarea
				rows="1"
				class={[
					'field-sizing-content min-w-0 flex-1 resize-none bg-transparent py-1 break-words outline-none placeholder:text-faint',
					done && !striking && 'line-through'
				]}
				value={text}
				placeholder="Write something"
				aria-label={text || 'New item'}
				data-item-input={id}
				draggable="false"
				oninput={(event) => {
					// a line has no breaks: pasted ones become spaces
					const input = event.currentTarget;
					if (input.value.includes('\n')) input.value = input.value.replace(/\s*\n\s*/g, ' ');
				}}
				onblur={(event) => {
					if (event.currentTarget.value !== text) onsave?.(event.currentTarget.value);
				}}
				{onkeydown}></textarea>
			{#if striking}
				<!-- the same text, unseen, wrapping just the same: what the line is drawn through -->
				<span aria-hidden="true" class="pointer-events-none absolute inset-0 py-1 break-words">
					<span class="strike-draw">{text}</span>
				</span>
			{/if}
		</span>
	{/if}
	{#if fold?.folded}
		<!-- how many are folded away under it -->
		<span aria-hidden="true" class="shrink-0 self-start py-1 pl-1 text-faint tabular-nums">
			{fold.count}
		</span>
	{/if}
</div>
