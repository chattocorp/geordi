<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { renderMarkdown } from '#lib/markdown.ts';

	/** `pictures` is where the pictures of the workspace this was written in are served. */
	let {
		text,
		dimmed = false,
		pictures
	}: { text: string; dimmed?: boolean; pictures?: string } = $props();

	const html = $derived(renderMarkdown(text, pictures));

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

	/** A picture that cannot be had (no such file, not a picture) leaves its path, as written. */
	const missingPictures: Attachment<HTMLElement> = (node) => {
		const onerror = (event: Event) => {
			const picture = event.target as HTMLElement;
			if (picture.dataset.picture === undefined) return;
			const path = document.createElement('code');
			path.textContent = picture.dataset.picture;
			(picture.closest('a') ?? picture).replaceWith(path);
		};
		// `error` does not bubble: caught on its way down
		node.addEventListener('error', onerror, true);
		return () => node.removeEventListener('error', onerror, true);
	};
</script>

<div
	class="prose max-w-none prose-pre:rounded-control"
	class:opacity-75={dimmed}
	{@attach copyButtons}
	{@attach missingPictures}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it escapes raw HTML -->
	{@html html}
</div>
