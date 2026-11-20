<script lang="ts">
	import { hint, keysOf, type ShortcutId } from './keys.ts';

	/**
	 * A keyboard shortcut, quietly: each key on a faint keycap. Mac modifiers are icons, so
	 * they look the same whatever font is at hand. Read out as it is written (`⌥⌘R`).
	 */
	let { id, mac }: { id: ShortcutId; mac?: boolean } = $props();

	const icons: Record<string, string> = {
		alt: 'icon-[lucide--option]',
		shift: 'icon-[lucide--arrow-big-up]',
		cmd: 'icon-[lucide--command]'
	};
</script>

<kbd
	class="inline-flex shrink-0 items-center gap-0.5 font-sans text-xs font-medium text-muted"
	aria-label={hint(id, mac)}
	title={hint(id, mac)}
>
	{#each keysOf(id, mac) as key, index (index)}
		<span
			aria-hidden="true"
			class="grid h-5 min-w-5 place-items-center rounded-control bg-hover px-1 leading-none"
		>
			{#if icons[key]}<span class={[icons[key], 'size-3']}></span>{:else}{key}{/if}
		</span>
	{/each}
</kbd>
