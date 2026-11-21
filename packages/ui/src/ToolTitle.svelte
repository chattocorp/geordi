<script lang="ts">
	import type { TitlePart } from './tools.ts';

	/** A tool call's title on one line: words in the text face, code (paths, commands) in mono. */
	let { parts, class: extra }: { parts: TitlePart[]; class?: string } = $props();
</script>

<span class={['min-w-0 truncate', extra]}>
	{#each parts as part, i (i)}<span class={part.code ? 'code-dense text-muted' : 'font-medium'}>
			{part.text}
		</span>{/each}
</span>
