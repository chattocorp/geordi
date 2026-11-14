<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { renderMarkdown } from '#lib/markdown.ts';

	let { text }: { text: string } = $props();

	const html = $derived(renderMarkdown(text));

	/** Copies a code block when its copy button (rendered by `renderMarkdown`) is clicked. */
	const copyButtons: Attachment<HTMLElement> = (node) => {
		const onclick = async (event: MouseEvent) => {
			const button = (event.target as Element).closest<HTMLElement>('[data-copy]');
			if (!button) return;
			await navigator.clipboard.writeText(button.nextElementSibling?.textContent ?? '');
			button.dataset.copied = '';
			setTimeout(() => delete button.dataset.copied, 1500);
		};
		node.addEventListener('click', onclick);
		return () => node.removeEventListener('click', onclick);
	};
</script>

<div class="prose max-w-none prose-pre:rounded-md prose-pre:text-[13px]" {@attach copyButtons}>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it escapes raw HTML -->
	{@html html}
</div>
