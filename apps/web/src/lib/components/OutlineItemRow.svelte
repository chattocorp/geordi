<script lang="ts">
	/**
	 * A row of the outline that is an item without a workspace (FDR-019): its text is what is
	 * read and edited, in place, like a line in any outliner. It is a folder, and its sign
	 * says so. What is under it folds, and it is zoomed into, from beside that (the outline's
	 * gutter, as in Workflowy). An archived workspace's item (`href`) is a done line that
	 * leads to its conversation, and is not edited here.
	 *
	 * Under its text, its note, where it has one: more about it than fits a line, smaller and
	 * quieter, two lines of it until it is edited. Shift-Enter in the line goes to it.
	 */
	import { tick } from 'svelte';

	let {
		id,
		text,
		note = '',
		truncate = false,
		href,
		fold,
		highlighted = false,
		dragging = false,
		onsave,
		onnote,
		onkeydown
	}: {
		id: string;
		text: string;
		note?: string;
		/** Whether a long line is cut short, to one line (the sidebar); else it wraps. */
		truncate?: boolean;
		href?: string;
		/** What is folded under it: folded, how many there are is said after its text. */
		fold?: { folded: boolean; count: number; toggle(): void };
		highlighted?: boolean;
		dragging?: boolean;
		/** Called with its text when the line is left, where it changed. */
		onsave?: (text: string) => void;
		/** Called with its note when the note is left, where it changed. */
		onnote?: (note: string) => void;
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => void;
	} = $props();

	/** The note as it shows: as written here, until what was saved comes back. */
	let written = $derived(note);
	let noting = $state(false);
	let line = $state<HTMLTextAreaElement>();
	let noteField = $state<HTMLTextAreaElement>();

	/** Puts the cursor in its note, at the end: a new one, where it has none. */
	export async function editNote() {
		noting = true;
		await tick();
		noteField?.focus();
		noteField?.setSelectionRange(written.length, written.length);
	}

	function noteKeys(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		const field = event.currentTarget;
		const atStart = field.selectionStart === 0 && field.selectionEnd === 0;
		const back =
			event.key === 'Escape' ||
			(event.key === 'Enter' && event.shiftKey) ||
			(event.key === 'ArrowUp' && atStart && !event.altKey && !event.metaKey && !event.ctrlKey) ||
			(event.key === 'Backspace' && field.value === '');
		if (!back) return;
		// back to its line, and no further: the outline's keys would go on to the row above
		event.preventDefault();
		event.stopPropagation();
		line?.focus();
	}

	/** A long line: cut short, or wrapping. */
	const cut = $derived(truncate ? 'truncate' : 'break-words');
</script>

<div
	class={[
		'group relative item gap-1 px-1 text-base',
		dragging && 'opacity-60',
		highlighted && 'bg-hover text-ink',
		href && 'text-faint'
	]}
>
	<!-- a long line wraps: what is beside it stays level with its first line -->
	<span class="mt-1 grid size-6 shrink-0 place-items-center self-start text-muted">
		{#if href}
			<span class="icon-[lucide--circle-check] size-4 text-faint"></span>
		{:else}
			<span aria-hidden="true" class="icon-[lucide--folder] size-4 text-faint"></span>
		{/if}
	</span>
	{#if href}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolved URL -->
		<a {href} class={['min-w-0 flex-1 py-1 line-through', cut]} draggable="false">{text}</a>
	{:else}
		<!-- one line of text, as long as it is: it wraps, and grows to fit (`field-sizing`) -->
		<span class="flex min-w-0 flex-1 flex-col">
			<span class="flex min-w-0 flex-1">
				<textarea
					bind:this={line}
					rows="1"
					class={[
						'field-sizing-content min-w-0 flex-1 resize-none bg-transparent py-1 outline-none placeholder:text-faint',
						cut
					]}
					value={text}
					placeholder="Write something"
					aria-label={text || 'New folder'}
					data-item-input={id}
					draggable="false"
					oninput={(event) => {
						// a line has no breaks: pasted ones become spaces
						const input = event.currentTarget;
						if (input.value.includes('\n')) input.value = input.value.replace(/\s*\n\s*/g, ' ');
					}}
					onblur={(event) => {
						// a line cut short was scrolled along while typing: back to its start
						event.currentTarget.scrollLeft = 0;
						if (event.currentTarget.value !== text) onsave?.(event.currentTarget.value);
					}}
					onkeydown={(event) => {
						const plain = !event.altKey && !event.metaKey && !event.ctrlKey;
						if (event.key === 'Enter' && event.shiftKey && plain && onnote) {
							event.preventDefault();
							void editNote();
						} else onkeydown?.(event);
					}}></textarea>
			</span>
			{#if noting}
				<textarea
					bind:this={noteField}
					rows="1"
					class="field-sizing-content resize-none bg-transparent pb-1 text-sm break-words text-muted outline-none placeholder:text-faint"
					value={written}
					placeholder="Add a note"
					aria-label="Note on {text || 'this item'}"
					draggable="false"
					onkeydown={noteKeys}
					onblur={(event) => {
						noting = false;
						const value = event.currentTarget.value.trim();
						if (value === written) return;
						written = value;
						onnote?.(value);
					}}></textarea>
			{:else if written}
				<!-- read as text, and edited where it is: a click goes into it -->
				<button
					type="button"
					class="line-clamp-2 cursor-text pb-1 text-left text-sm break-words whitespace-pre-line text-muted"
					aria-label="Edit the note on {text || 'this item'}"
					draggable="false"
					onclick={editNote}
				>
					{written}
				</button>
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
