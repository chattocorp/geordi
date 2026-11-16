<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Spinner from './Spinner.svelte';

	type Props = {
		/**
		 * `primary` for the one main action of a view (gold), `secondary` for other actions,
		 * `ghost` for quiet ones that sit inside something else (toolbars, rows, tabs).
		 */
		variant?: 'primary' | 'secondary' | 'ghost';
		/**
		 * What a `primary` button is coloured in: the accent, as a rule. `merged` for the one
		 * step left when work has landed, in the colour that says so.
		 */
		tone?: 'accent' | 'merged';
		size?: 'md' | 'sm';
		/** An Iconify class, e.g. `icon-[lucide--plus]`. */
		icon?: string;
		/**
		 * What it does is under way: its icon turns into a spinner, and it can't be pressed
		 * again until that is over.
		 */
		busy?: boolean;
		/** What the button does. Required when it has no text: it becomes the accessible name. */
		label?: string;
		children?: Snippet;
	} & HTMLButtonAttributes;

	let {
		variant = 'secondary',
		tone = 'accent',
		size = 'md',
		icon,
		busy = false,
		label,
		children,
		class: extra,
		...rest
	}: Props = $props();

	const tones = $derived({
		primary: [
			'rounded-full font-semibold shadow-soft hover:brightness-105',
			tone === 'merged' ? 'bg-merged text-on-merged' : 'bg-accent text-on-accent'
		],
		secondary: 'rounded-full bg-sunken font-medium ring-1 ring-line hover:bg-line/50',
		ghost: 'rounded-control font-medium text-muted hover:bg-sunken hover:text-ink'
	});
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
		'inline-flex shrink-0 items-center justify-center select-none disabled:opacity-60',
		tones[variant],
		shapes[size][children ? 0 : 1],
		children && (icon ? 'pr-4 pl-3' : 'px-4'),
		extra
	]}
	{...rest}
	disabled={busy || rest.disabled}
	aria-busy={busy || undefined}
>
	{#if busy}
		<!-- as wide as the icon it stands in for, so that the button keeps its shape -->
		<span class={['grid place-items-center', size === 'sm' ? 'size-3.5' : 'size-4']}>
			<Spinner plain label="Under way" />
		</span>
	{:else if icon}
		<span class={[icon, size === 'sm' ? 'size-3.5' : 'size-4']}></span>
	{/if}
	{@render children?.()}
</button>
