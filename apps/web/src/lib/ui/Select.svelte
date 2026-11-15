<script lang="ts" generics="T extends string">
	import type { Snippet } from 'svelte';

	type Props = {
		/** What is being chosen; read out, not shown. */
		label: string;
		/** The form field's name, if this is part of a form. */
		name?: string;
		value?: T;
		options: { value: T; label: string }[];
		/** Something before the text: an icon, a meter. */
		leading?: Snippet;
	};
	let { label, name, value = $bindable(), options, leading }: Props = $props();
</script>

<!--
	A choice among many, as a quiet pill: the browser's own select, so it works with the
	keyboard, on touch, and in a form. Muted while it shows its first option (the default).
-->
<label
	class={[
		'relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full pr-2 pl-3 text-sm ring-1 ring-line has-focus-visible:outline-2 has-focus-visible:outline-accent',
		value === options[0]?.value ? 'text-muted' : 'bg-sunken text-ink ring-ink/20'
	]}
>
	{@render leading?.()}
	<span class="sr-only">{label}</span>
	<select
		{name}
		bind:value
		class="field-sizing-content cursor-pointer appearance-none bg-transparent pr-5 focus-visible:outline-none"
	>
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	<span class="pointer-events-none absolute right-2 icon-[lucide--chevron-down] size-3.5"></span>
</label>
