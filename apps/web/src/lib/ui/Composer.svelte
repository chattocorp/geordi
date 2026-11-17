<script lang="ts" module>
	import { getContext, setContext, type Snippet } from 'svelte';

	const TEXT = Symbol('composer text');

	/** Puts the cursor back in the text of the composer around, if there is one. */
	export const composerText = () => getContext<(() => void) | undefined>(TEXT);
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLFormAttributes, HTMLTextareaAttributes } from 'svelte/elements';
	import { submitOnEnter } from '#lib/keys.ts';

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
		rows?: number;
		/** Attributes for the textarea, e.g. a remote form field. Use this or bind `value`. */
		field?: HTMLTextareaAttributes;
		value?: string;
		disabled?: boolean;
		/** Replaces what keys do in the text. By default, Enter submits. */
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => void;
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
		problems = [],
		attachments,
		onpaste,
		header,
		footer,
		live = false,
		focused = false
	}: Props = $props();

	let text: HTMLTextAreaElement | undefined;
	const focus: Attachment<HTMLTextAreaElement> = (node) => {
		text = node;
		if (focused) node.focus();
	};
	// what is chosen in it (an agent, a model) is chosen for the text: back to writing it
	setContext(TEXT, () => text?.focus());

	const id = $props.id();
	const textarea = {
		id,
		get rows() {
			return rows;
		},
		get placeholder() {
			return placeholder;
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
		get onkeydown() {
			return onkeydown;
		},
		class:
			'block w-full resize-none bg-transparent px-4 py-2 placeholder:text-muted/60 focus-visible:outline-none disabled:cursor-not-allowed'
	};
</script>

<!-- Where people write to agents: a prompt, a reply, an issue. Enter submits. -->
<form
	{...form}
	class={[
		// (a container: what is in it goes by its width, not the window's)
		'group/composer @container card-float pt-2 focus-within:ring-accent/60',
		live && 'edge-live'
	]}
>
	<fieldset {disabled} class="min-w-0">
		{#if label}<label for={id} class="block px-4 pt-2 text-sm font-medium">{label}</label>{/if}
		{@render header?.()}
		{@render attachments?.()}
		{#if field}
			<textarea {...field} {...textarea} {@attach focus}></textarea>
		{:else}
			<textarea bind:value {...textarea} {@attach focus}></textarea>
		{/if}
		{#each problems as problem (problem)}
			<p class="px-4 text-sm text-danger">{problem}</p>
		{/each}
		<div class="flex flex-wrap items-center gap-2 px-3 pt-1 pb-3">{@render footer()}</div>
	</fieldset>
</form>
