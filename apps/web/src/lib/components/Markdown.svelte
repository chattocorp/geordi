<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { changedFiles } from '#lib/changedFiles.ts';
	import { changedFileIn, renderMarkdown } from '#lib/markdown.ts';
	import ImageViewer from '#lib/ui/ImageViewer.svelte';

	/** `pictures` is where the pictures of the workspace this was written in are served. */
	let {
		text,
		dimmed = false,
		pictures
	}: { text: string; dimmed?: boolean; pictures?: string } = $props();

	const files = changedFiles();
	let viewing = $state<{ src: string; alt: string } | null>(null);
	const html = $derived(
		renderMarkdown(text, {
			pictures,
			root: files?.root,
			file: files && ((code) => changedFileIn(code, files.paths, files.root))
		})
	);

	/**
	 * Clicks on what `renderMarkdown` made a button: a code block's copy button, a changed
	 * file's name, which opens its diff, and a picture, which opens in the viewer (with a
	 * modifier key, its link opens it on its own instead).
	 */
	const buttons: Attachment<HTMLElement> = (node) => {
		const onclick = async (event: MouseEvent) => {
			const target = event.target as Element;
			if (target instanceof HTMLImageElement && target.dataset.picture !== undefined) {
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
				event.preventDefault();
				viewing = { src: target.src, alt: target.alt };
				return;
			}
			const source = target.closest<HTMLElement>('[data-source]')?.dataset;
			if (source?.source)
				return files?.openSource(source.source, source.line ? Number(source.line) : undefined);
			const file = target.closest<HTMLElement>('[data-file]')?.dataset.file;
			if (file) return files?.open(file);
			const button = target.closest<HTMLElement>('[data-copy]');
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
	{@attach buttons}
	{@attach missingPictures}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it escapes raw HTML -->
	{@html html}
</div>

{#if viewing}<ImageViewer {...viewing} onclose={() => (viewing = null)} />{/if}
