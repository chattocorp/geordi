<script lang="ts" module>
	import { getContext, setContext, type Snippet } from 'svelte';

	const TEXT = Symbol('composer text');

	/** Puts the cursor back in the text of the composer around, if there is one. */
	export const composerText = () => getContext<(() => void) | undefined>(TEXT);
</script>

<script lang="ts">
	import type { FileMatch } from '@geordi/protocol';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLFormAttributes, HTMLTextareaAttributes } from 'svelte/elements';
	import Button from './Button.svelte';
	import { submitOnEnter } from './keys.ts';
	import {
		completionQuery,
		fileMention,
		fileCompletion,
		matching,
		type Completion
	} from './completions.ts';

	type Props = {
		/** Whether to put the cursor in the text when it appears: where writing is what one came for. */
		focused?: boolean;
		/** Whoever this is written to is at work: a light goes round its edge. */
		live?: boolean;
		/** Attributes for the form: a remote form (`{...createThing}`), or `{ onsubmit }`. */
		form: HTMLFormAttributes;
		/** A visible label above the text. Without one, the placeholder names the field. */
		label?: string;
		placeholder: string;
		/** How many lines the text has room for at least; it grows with what is written. */
		rows?: number;
		/** Attributes for the textarea, e.g. a remote form field. Use this or bind `value`. */
		field?: HTMLTextareaAttributes;
		value?: string;
		disabled?: boolean;
		/** A suggested reply to send or edit inside an empty composer. */
		suggestion?: string | null;
		/** Replaces what keys do in the text. By default, Enter submits. */
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => void;
		/**
		 * What the text can begin with: offered while it is a `/` and a word, filtered by that
		 * word. Arrow keys and Enter (or Tab) choose one, Escape puts them away.
		 */
		completions?: Completion[];
		files?: (query: string) => PromiseLike<FileMatch[]>;
		/** What the completions are, for those who can't see them: "Commands". */
		completionsLabel?: string;
		/** What is wrong with the input, if anything. */
		problems?: string[];
		/** Optional attachments above the text. */
		attachments?: Snippet;
		onpaste?: (event: ClipboardEvent) => void;
		/** Fields above the text (and hidden inputs). */
		header?: Snippet;
		/** The row under the text: options on the left, the submit button on the right. */
		footer: Snippet;
	};
	let {
		form,
		label,
		placeholder,
		rows = 3,
		field,
		value = $bindable(''),
		disabled = false,
		onkeydown = submitOnEnter,
		completions = [],
		files,
		completionsLabel = 'Completions',
		problems = [],
		attachments,
		onpaste,
		header,
		footer,
		live = false,
		focused = false,
		suggestion
	}: Props = $props();

	const id = $props.id();
	let text: HTMLTextAreaElement | undefined;
	/** The text as it was last written, and whether it is being written in. */
	let typed = $state('');
	let caret = $state(-1);
	let writing = $state(false);
	const focus: Attachment<HTMLTextAreaElement> = (node) => {
		text = node;
		if (focused) node.focus();
		// (listened to, not set as props: a remote form field has handlers of its own)
		const read = () => {
			typed = node.value;
			caret = node.selectionStart === node.selectionEnd ? node.selectionStart : -1;
			writing = document.activeElement === node;
		};
		const away = () => (writing = false);
		let submitted = $state(false);
		const clearTyped = () => (typed = '');
		const sent = () => {
			clearTyped();
			submitted = true;
		};
		const form = node.form;
		// A pending submission disables the field and the browser drops focus.
		$effect(() => {
			if (!submitted || disabled) return;
			submitted = false;
			if (document.activeElement === document.body || form?.contains(document.activeElement)) {
				node.focus({ preventScroll: true });
			}
		});
		node.addEventListener('selectionchange', read);
		node.addEventListener('input', read);
		node.addEventListener('focus', read);
		node.addEventListener('blur', away);
		form?.addEventListener('submit', sent);
		form?.addEventListener('reset', clearTyped);
		return () => {
			node.removeEventListener('selectionchange', read);
			node.removeEventListener('input', read);
			node.removeEventListener('focus', read);
			node.removeEventListener('blur', away);
			form?.removeEventListener('submit', sent);
			form?.removeEventListener('reset', clearTyped);
		};
	};

	/** The text the completions were put away for, with Escape: until it is another. */
	let dismissed = $state<string>();
	let active = $state(0);
	const query = $derived(
		completions.length && writing && typed !== dismissed ? completionQuery(typed) : null
	);
	const mention = $derived(
		files && writing && typed !== dismissed && caret >= 0 ? fileMention(typed, caret) : null
	);
	let fileResults = $state.raw<Completion[]>([]);
	let resultsFrom: typeof files;
	let loadingFiles = $state(false);
	let showFileProgress = $state(false);
	let fileError = $state(false);
	let previous = Promise.resolve();
	const fileQuery = $derived(mention?.query);
	$effect(() => {
		const search = files;
		const wanted = fileQuery;
		if (wanted === undefined || resultsFrom !== search) {
			fileResults = [];
			active = 0;
		}
		resultsFrom = search;
		fileError = false;
		showFileProgress = false;
		loadingFiles = wanted !== undefined && !!search;
		if (wanted === undefined || !search) return;
		let current = true;
		const slow = setTimeout(() => {
			showFileProgress = true;
		}, 200);
		// Coalesce typing, including edits made while a cold index is still building.
		const timer = setTimeout(() => {
			previous = previous.then(async () => {
				if (!current) return;
				try {
					const matches = await search(wanted);
					if (current) {
						const selected = active > 0 ? fileResults[active]?.text : undefined;
						fileResults = matches.map(fileCompletion);
						active = selected
							? Math.max(
									0,
									fileResults.findIndex((row) => row.text === selected)
								)
							: 0;
					}
				} catch {
					if (current) {
						fileResults = [];
						fileError = true;
					}
				} finally {
					clearTimeout(slow);
					if (current) loadingFiles = false;
				}
			});
		}, 35);
		return () => {
			current = false;
			clearTimeout(slow);
			clearTimeout(timer);
		};
	});
	const shown = $derived(
		mention ? fileResults : query === null ? [] : matching(completions, query)
	);
	$effect.pre(() => {
		void query;
		if (!mention) active = 0;
	});
	const listId = `${id}-completions`;
	$effect(() => {
		if (shown.length)
			document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
	});

	/** Puts `words` into the box as if typed, the cursor after them. */
	function write(words: string) {
		if (!text) return;
		text.value = words;
		// whoever follows the text (a bound value, a form field) hears of it
		text.dispatchEvent(new Event('input', { bubbles: true }));
		text.focus();
		text.setSelectionRange(words.length, words.length);
	}
	function complete(completion: Completion) {
		if (!mention || !text) return write(completion.text + ' ');
		const path = /\s/.test(completion.text) ? JSON.stringify(completion.text) : completion.text;
		const suffix = typed.slice(mention.end);
		const insert = '@' + path + (/^\s/.test(suffix) ? '' : ' ');
		text.setRangeText(insert, mention.start, mention.end, 'end');
		if (/^\s/.test(suffix)) text.setSelectionRange(text.selectionEnd + 1, text.selectionEnd + 1);
		text.dispatchEvent(new Event('input', { bubbles: true }));
	}

	let available = $derived(suggestion);
	const offered = $derived(!disabled && !(field ? field.value : value) ? available : null);

	function takeSuggestion(words: string, send: boolean) {
		available = null;
		write(words);
		if (send) text?.form?.requestSubmit();
	}

	function keydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		const plainKey = !event.isComposing && !event.altKey && !event.metaKey && !event.ctrlKey;
		if (offered && plainKey && event.key === 'Tab' && !event.shiftKey) {
			event.preventDefault();
			takeSuggestion(offered, false);
			return;
		}
		if (mention && plainKey && event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			dismissed = typed;
			return;
		}
		if (shown.length && plainKey && !loadingFiles) {
			const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
			if (step) {
				event.preventDefault();
				active = (active + step + shown.length) % shown.length;
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				dismissed = typed;
				return;
			}
			const chosen = shown[active];
			// Enter on what is written out already sends it
			const choosing =
				(event.key === 'Tab' || (event.key === 'Enter' && chosen.text !== typed)) &&
				!event.shiftKey;
			if (choosing) {
				event.preventDefault();
				complete(chosen);
				return;
			}
		}
		onkeydown(event);
	}
	// what is chosen in it (an agent, a model) is chosen for the text: back to writing it
	setContext(TEXT, () => text?.focus());

	const textarea = {
		id,
		get rows() {
			return rows;
		},
		// it grows with its text (`field-sizing`), from `rows` lines (and its padding) up to a limit
		get style() {
			return `min-height: calc(${rows}lh + 1rem)`;
		},
		get placeholder() {
			return offered ? '' : placeholder;
		},
		get disabled() {
			return disabled;
		},
		get 'aria-label'() {
			return label ? undefined : placeholder;
		},
		get onpaste() {
			return onpaste;
		},
		onkeydown: keydown,
		// with completions, the text is a combobox: what it offers is a list beside it
		get role() {
			return files || completions.length ? 'combobox' : undefined;
		},
		get 'aria-autocomplete'() {
			return files || completions.length ? ('list' as const) : undefined;
		},
		get 'aria-expanded'() {
			return files || completions.length ? shown.length > 0 : undefined;
		},
		get 'aria-controls'() {
			return shown.length ? listId : undefined;
		},
		get 'aria-activedescendant'() {
			return shown.length && !loadingFiles ? `${listId}-${active}` : undefined;
		},
		class:
			'col-start-1 row-start-1 block max-h-80 w-full resize-none field-sizing-content bg-transparent px-4 py-2 placeholder:text-muted/60 focus-visible:outline-none disabled:cursor-not-allowed'
	};
</script>

{#snippet highlighted(parts: NonNullable<Completion['file']>['name'])}
	{#each parts as part, index (index)}
		{#if part.hit}<mark class="bg-transparent font-semibold text-accent-ink">{part.text}</mark
			>{:else}{part.text}{/if}
	{/each}
{/snippet}

<!-- Where people write to agents: a prompt, a reply, an issue. Enter submits. -->
<form
	{...form}
	data-live={live || undefined}
	class="group/composer @container edge-live relative flex min-h-0 flex-col card-float pt-2 focus-within:ring-muted/60 data-dropping:ring-accent/60 motion-safe:transition-shadow"
>
	{#if mention && !shown.length && ((loadingFiles && showFileProgress) || fileError)}
		<div
			role="status"
			class="absolute inset-x-0 bottom-full z-10 mb-2 max-w-lg card-float px-4 py-2 text-sm text-muted"
		>
			{loadingFiles ? 'Finding files…' : 'Could not search repository files'}
		</div>
	{/if}
	{#if shown.length}
		<!-- Above the text, which is at the bottom of the page: what fits, and the rest scrolls.
		     Pressing anything in it leaves the cursor in the text. -->
		<div
			id={listId}
			role="listbox"
			aria-busy={loadingFiles || undefined}
			tabindex="-1"
			aria-label={mention ? 'Repository files' : completionsLabel}
			class={[
				'absolute inset-x-0 bottom-full z-10 mb-2 max-h-72 overflow-y-auto card-float p-2',
				mention && 'max-w-lg'
			]}
			onmousedown={(event) => event.preventDefault()}
		>
			{#each shown as completion, index (completion.text)}
				<!-- (the keys are the text's: the cursor stays in it) -->
				<div
					id="{listId}-{index}"
					role="option"
					tabindex="-1"
					aria-selected={!loadingFiles && index === active}
					aria-disabled={loadingFiles || undefined}
					aria-label={mention ? completion.text : undefined}
					title={mention ? completion.text : undefined}
					class={['menu-item cursor-pointer', index === active && 'menu-item-active']}
					onmousedown={() => !loadingFiles && complete(completion)}
					onmousemove={() => !loadingFiles && (active = index)}
				>
					{#if completion.file}
						<span
							aria-hidden="true"
							class={[
								'mx-1 icon-[lucide--file] size-4 shrink-0',
								index === active && 'text-accent-ink'
							]}
						></span>
						<span class="flex min-w-0 flex-1 items-baseline gap-2">
							<span class="max-w-full shrink-0 truncate code font-medium text-ink"
								>{@render highlighted(completion.file.name)}</span
							>
							{#if completion.file.directory.length}
								<span class="min-w-0 truncate text-left code-dense text-muted" dir="rtl"
									><bdi>{@render highlighted(completion.file.directory)}</bdi></span
								>
							{/if}
						</span>
						{#if index === active && !loadingFiles}
							<span
								aria-hidden="true"
								class="mr-1 icon-[lucide--corner-down-left] size-3.5 shrink-0 text-muted"
							></span>
						{/if}
					{:else}
						<span title={completion.text} class="min-w-0 truncate code text-ink"
							>{completion.text}</span
						>
						{#if completion.hint}
							<span class="max-w-1/3 shrink-0 truncate code-dense text-muted"
								>{completion.hint}</span
							>
						{/if}
						{#if completion.description}
							<span class="min-w-0 truncate">{completion.description}</span>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	<fieldset {disabled} class="min-w-0 shrink-0">
		{#if label}<label for={id} class="block px-4 pt-2 text-sm font-medium">{label}</label>{/if}
		{@render header?.()}
		{@render attachments?.()}
		<div class="grid">
			{#if offered}
				<div
					role="group"
					aria-label="Suggested reply"
					class="pointer-events-none relative z-1 col-start-1 row-start-1 mx-4 my-2 max-h-40 min-w-0 self-start overflow-y-auto overscroll-contain text-muted"
				>
					<span
						role="button"
						tabindex="0"
						title="Send suggested reply"
						class="pointer-events-auto wrap-anywhere whitespace-pre-wrap hover:text-ink"
						onclick={() => takeSuggestion(offered, true)}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								takeSuggestion(offered, true);
							}
						}}>{offered}</span
					><span class="whitespace-nowrap"
						>&NoBreak;<span class="relative inline-block w-6 align-baseline" style="height: 1cap"
							><Button
								variant="ghost"
								icon="icon-[lucide--pencil] -translate-y-0.75"
								label="Edit suggested reply"
								size="sm"
								class="pointer-events-auto absolute top-1/2 left-0 -translate-y-1/2"
								onclick={() => takeSuggestion(offered, false)}
							/></span
						></span
					>
				</div>
			{/if}
			{#if field}
				<textarea {...field} {...textarea} {@attach focus}></textarea>
			{:else}
				<textarea bind:value {...textarea} {@attach focus}></textarea>
			{/if}
		</div>
		{#each problems as problem (problem)}
			<p class="px-4 text-sm text-danger">{problem}</p>
		{/each}
		<div class="flex flex-wrap items-center gap-2 px-3 pt-1 pb-3">{@render footer()}</div>
	</fieldset>
</form>
