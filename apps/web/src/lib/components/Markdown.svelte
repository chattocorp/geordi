<script lang="ts">
	import { renderMarkdown } from '#lib/markdown.ts';

	let { text }: { text: string } = $props();

	const html = $derived(renderMarkdown(text));
</script>

<div class="prose max-w-none prose-pre:rounded-md prose-pre:text-[13px]">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it escapes raw HTML -->
	{@html html}
</div>
