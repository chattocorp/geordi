<script lang="ts">
	import { capsOf, hint, keysOf, writtenOf, type ShortcutId } from './keys.ts';

	/**
	 * A keyboard shortcut, quietly: each key on a faint keycap. Mac modifiers are icons, so
	 * they look the same whatever font is at hand. Read out as it is written (`⌥⌘R`).
	 * One of Geordi's shortcuts (`id`), or keys that are none of them (`keys`: `alt`, `shift`,
	 * `cmd`, `enter`, or the key itself), such as those of an outline's row.
	 */
	let { id, keys }: { id?: ShortcutId; keys?: string[] } = $props();

	const caps = $derived(keys ? capsOf(keys) : id ? keysOf(id) : []);
	const written = $derived(keys ? writtenOf(keys) : id ? hint(id) : '');

	const icons: Record<string, string> = {
		alt: 'icon-[lucide--option]',
		shift: 'icon-[lucide--arrow-big-up]',
		cmd: 'icon-[lucide--command]',
		enter: 'icon-[lucide--corner-down-left]'
	};
</script>

<kbd
	class="inline-flex shrink-0 items-center gap-0.5 font-sans text-xs font-medium text-muted"
	aria-label={written}
	title={written}
>
	{#each caps as key, index (index)}
		<span
			aria-hidden="true"
			class="grid h-5 min-w-5 place-items-center rounded-control bg-hover px-1 leading-none"
		>
			{#if icons[key]}<span class={[icons[key], 'size-3']}></span>{:else}{key}{/if}
		</span>
	{/each}
</kbd>
