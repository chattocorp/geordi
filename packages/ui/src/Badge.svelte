<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** `accent` is for things that are live or need attention; everything else is `neutral`. */
		tone?: 'neutral' | 'accent';
		/** Shows a status dot before the text. */
		dot?: boolean;
		children: Snippet;
	};
	let { tone = 'neutral', dot = false, children }: Props = $props();
</script>

<span
	class={[
		'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
		tone === 'accent' ? 'tone-accent' : 'bg-sunken text-muted'
	]}
>
	{#if dot}<span class={['dot', tone === 'accent' ? 'bg-accent' : 'bg-faint']}></span>{/if}
	{@render children()}
</span>
