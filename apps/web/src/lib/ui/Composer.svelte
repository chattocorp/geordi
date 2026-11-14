<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLFormAttributes, HTMLTextareaAttributes } from 'svelte/elements';
	import { submitOnEnter } from '#lib/keys.ts';

	type Props = {
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
		/** What is wrong with the input, if anything. */
		problems?: string[];
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
		problems = [],
		header,
		footer
	}: Props = $props();

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
		onkeydown: submitOnEnter,
		class:
			'block w-full resize-none bg-transparent px-4 py-2 placeholder:text-muted/60 focus-visible:outline-none disabled:cursor-not-allowed'
	};
</script>

<!-- Where people write to agents: a prompt, a reply, an issue. Enter submits. -->
<form {...form} class="card-float pt-2 focus-within:ring-accent/60">
	{#if label}<label for={id} class="block px-4 pt-2 text-sm font-medium">{label}</label>{/if}
	{@render header?.()}
	{#if field}
		<textarea {...field} {...textarea}></textarea>
	{:else}
		<textarea bind:value {...textarea}></textarea>
	{/if}
	{#each problems as problem (problem)}
		<p class="px-4 text-sm text-danger">{problem}</p>
	{/each}
	<div class="flex flex-wrap items-center gap-2 px-3 pt-1 pb-3">{@render footer()}</div>
</form>
