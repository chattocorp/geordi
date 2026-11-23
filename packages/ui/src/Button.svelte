<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import ProgressIcon from './ProgressIcon.svelte';

	type Props = {
		/**
		 * `primary` for the one main action of a view (gold), `secondary` for other actions,
		 * `ghost` for quiet ones that sit inside something else (toolbars, rows, tabs), with
		 * a background while on (`aria-pressed`), `soft` for other actions inside something
		 * coloured: it takes that colour, faintly.
		 */
		variant?: 'primary' | 'secondary' | 'ghost' | 'soft';
		/**
		 * What a `primary` button is coloured in: the accent, as a rule. `merged` for the one
		 * step left when work has landed, `ok` for the step that is clear to take, each in the
		 * colour that says so.
		 */
		tone?: 'accent' | 'merged' | 'ok';
		size?: 'md' | 'sm';
		/** An Iconify class, e.g. `icon-[lucide--plus]`. */
		icon?: string;
		/**
		 * What it does is under way: its icon turns into a spinner, and it can't be pressed
		 * again until that is over.
		 */
		busy?: boolean;
		/**
		 * What it started is still at work (a server booting): its icon turns into a spinner,
		 * but it can still be pressed, to stop it, say.
		 */
		working?: boolean;
		/** What the button does. Required when it has no text: it becomes the accessible name. */
		label?: string;
		/** Where it goes: it becomes a link that looks the same. */
		href?: string;
		children?: Snippet;
	} & HTMLButtonAttributes &
		Pick<HTMLAnchorAttributes, 'target' | 'rel'>;

	let {
		variant = 'secondary',
		tone = 'accent',
		size = 'md',
		icon,
		busy = false,
		working = false,
		label,
		href,
		children,
		class: extra,
		...rest
	}: Props = $props();

	const toggle = $derived(rest['aria-pressed'] !== undefined);
	const tones = $derived({
		primary: [
			'rounded-full font-semibold shadow-soft hover:brightness-105',
			tone === 'merged'
				? 'bg-merged text-on-merged'
				: tone === 'ok'
					? 'bg-ok text-on-ok'
					: 'bg-accent text-on-accent'
		],
		secondary: 'rounded-full bg-sunken font-medium shadow-soft hover:bg-hover',
		// A toggle shows that it is on by its background, so hovering it must not paint
		// one too: in dark mode the two look alike.
		ghost: [
			'rounded-control font-medium text-muted hover:text-ink',
			toggle ? 'aria-pressed:bg-surface aria-pressed:text-ink' : 'hover:bg-hover'
		],
		soft: 'rounded-full bg-current/12 font-medium hover:bg-current/20'
	});
	// A pill with a bare icon is a circle as tall as a pill with text, so that the two line
	// up side by side; ghost icons are smaller, to sit quietly in bars and rows.
	const pill = $derived(variant !== 'ghost');
	const shapes = $derived({
		// with text, and as a bare icon
		md: ['h-9 gap-2 text-sm', pill ? 'size-9' : 'size-8'],
		sm: ['h-7 gap-1.5 text-xs', pill ? 'size-7' : 'size-6']
	});
</script>

<svelte:element
	this={href ? 'a' : 'button'}
	type={href ? undefined : 'button'}
	{href}
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
	disabled={href ? undefined : busy || rest.disabled}
	aria-busy={busy || undefined}
>
	{#if busy || working}
		<!-- as wide as the icon it stands in for, so that the button keeps its shape -->
		<ProgressIcon label="Under way" class={size === 'sm' ? 'size-3.5' : 'size-4'} />
	{:else if icon}
		<span class={[icon, size === 'sm' ? 'size-3.5' : 'size-4']}></span>
	{/if}
	{@render children?.()}
</svelte:element>
