<script lang="ts" generics="T extends string">
	type Props = {
		/** What is being chosen, for those who can't see it. */
		label: string;
		value: T;
		options: { value: T; label: string; icon?: string }[];
		/** Show only the options' icons, their labels as tooltips: for choices in a bar. */
		icons?: boolean;
		/**
		 * As tall as a `Button` of the same size beside it: with `icons`, as a ghost icon
		 * button, so that it sits in the same bars.
		 */
		size?: 'md' | 'sm';
	};
	let { label, value = $bindable(), options, icons = false, size = 'md' }: Props = $props();

	// segments sit 2px inside the track, which makes up the rest of a button's height
	const shape = $derived(
		icons
			? size === 'sm'
				? 'size-5 justify-center'
				: 'size-7 justify-center'
			: size === 'sm'
				? 'h-6 gap-1 px-2.5 text-xs'
				: 'h-8 gap-1.5 px-3 text-sm'
	);
	const glyph = $derived(size === 'sm' ? 'size-3.5' : 'size-4');
</script>

<!-- One of a few, all in view: for two to four choices. More than that wants a `Select`. -->
<div
	role="radiogroup"
	aria-label={label}
	class="inline-flex shrink-0 rounded-full bg-sunken p-0.5 ring-1 ring-line"
>
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={option.value === value}
			aria-label={icons ? option.label : undefined}
			title={icons ? option.label : undefined}
			onclick={() => (value = option.value)}
			class={[
				'inline-flex items-center rounded-full font-medium whitespace-nowrap',
				shape,
				option.value === value ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink'
			]}
		>
			{#if option.icon}<span class={[option.icon, glyph]}></span>{/if}
			{#if !icons}{option.label}{/if}
		</button>
	{/each}
</div>
