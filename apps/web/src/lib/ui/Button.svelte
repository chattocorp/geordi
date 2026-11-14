<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = {
		/**
		 * `primary` for the one main action of a view (gold), `secondary` for other actions,
		 * `ghost` for quiet ones that sit inside something else (toolbars, rows, tabs).
		 */
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: 'md' | 'sm';
		/** An Iconify class, e.g. `icon-[lucide--plus]`. */
		icon?: string;
		/** What the button does. Required when it has no text: it becomes the accessible name. */
		label?: string;
		children?: Snippet;
	} & HTMLButtonAttributes;

	let {
		variant = 'secondary',
		size = 'md',
		icon,
		label,
		children,
		class: extra,
		...rest
	}: Props = $props();

	const tones = {
		primary: 'rounded-full bg-accent font-semibold text-on-accent shadow-soft hover:brightness-105',
		secondary: 'rounded-full bg-sunken font-medium ring-1 ring-line hover:bg-line/50',
		ghost: 'rounded-control font-medium text-muted hover:bg-sunken hover:text-ink'
	};
	const shapes = {
		// with text, and as a bare icon
		md: ['h-9 gap-2 text-sm', 'size-8'],
		sm: ['h-7 gap-1.5 text-xs', 'size-6']
	};
</script>

<button
	type="button"
	aria-label={children ? undefined : label}
	title={label}
	class={[
		'inline-flex shrink-0 items-center justify-center select-none disabled:cursor-not-allowed disabled:opacity-60',
		tones[variant],
		shapes[size][children ? 0 : 1],
		children && (icon ? 'pr-4 pl-3' : 'px-4'),
		extra
	]}
	{...rest}
>
	{#if icon}<span class={[icon, size === 'sm' ? 'size-3.5' : 'size-4']}></span>{/if}
	{@render children?.()}
</button>
