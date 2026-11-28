<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { changedFiles } from '#lib/changedFiles.ts';
	import { drawDiagrams } from '#lib/diagrams.ts';
	import { changedFileIn, renderMarkdown } from '#lib/markdown.ts';
	import ImageViewer from '#lib/ui/ImageViewer.svelte';
	import SoundPlayer from '#lib/ui/SoundPlayer.svelte';
	import { workspaceLinksContext } from '#lib/workspace-links.ts';
	import { mount, unmount } from 'svelte';

	/** `pictures` is where the pictures of the workspace this was written in are served. */
	let {
		text,
		agentDirectives = false,
		dimmed = false,
		preserveLineBreaks = false,
		pictures,
		onrun,
		documentPath
	}: {
		text: string;
		agentDirectives?: boolean;
		dimmed?: boolean;
		preserveLineBreaks?: boolean;
		pictures?: string;
		onrun?: (command: string) => void;
		documentPath?: string;
	} = $props();

	const files = changedFiles();
	const workspaces = workspaceLinksContext();
	let content = $state<HTMLElement>();
	let viewing = $state<{ src: string; alt: string } | null>(null);
	const html = $derived(
		renderMarkdown(text, {
			canRun: !!onrun,
			agentDirectives,
			preserveLineBreaks,
			documentPath,
			pictures,
			root: files?.root,
			file: files && ((code) => changedFileIn(code, files.paths, files.root)),
			workspaces: workspaces?.()
		})
	);

	// Diagrams are drawn anew whenever the text changes: Pele takes a fraction of a millisecond
	$effect(() => {
		void html;
		if (content) return drawDiagrams(content);
	});

	// A sound the agent shows gets a player where it is named (see markdown.ts); one that
	// cannot be had leaves its path, as a missing picture does
	$effect(() => {
		void html;
		if (!content) return;
		const players = [...content.querySelectorAll<HTMLElement>('[data-sound]')].map((place) =>
			mount(SoundPlayer, {
				target: place,
				props: {
					src: place.dataset.sound!,
					label: place.dataset.label!,
					onfail: () => {
						const path = document.createElement('code');
						path.textContent = place.dataset.soundPath!;
						place.replaceWith(path);
					}
				}
			})
		);
		return () => players.forEach((player) => void unmount(player));
	});

	// A path that may be a file or directory (`data-path`) becomes a button once the daemon
	// says it is one, so that what is neither stays plain code: a file opens in a tab of its
	// own, a directory in the file manager
	$effect(() => {
		void html;
		const kindOf = files?.kindOf;
		if (!content || !kindOf) return;
		for (const mark of content.querySelectorAll<HTMLElement>('[data-path]')) {
			const { path, line } = mark.dataset as { path: string; line?: string };
			delete mark.dataset.path;
			delete mark.dataset.line;
			void kindOf(path).then((kind) => {
				if (!kind || !mark.isConnected) return;
				const button = document.createElement('button');
				button.type = 'button';
				if (kind === 'folder') {
					button.dataset.folder = path;
					button.title = 'Open this folder';
				} else {
					button.dataset.source = path;
					if (line) button.dataset.line = line;
					button.title = 'Open this file';
				}
				mark.replaceWith(button);
				button.append(mark);
			});
		}
	});

	/**
	 * Clicks on what `renderMarkdown` made a button: a code block's copy button, a changed
	 * file's name, which opens its diff, another file's, which opens it, a directory's, which opens it in the file manager, and a picture, which opens in the viewer (with a
	 * modifier key, its link opens it on its own instead), as a drawn SVG does.
	 */
	const buttons: Attachment<HTMLElement> = (node) => {
		const onclick = async (event: MouseEvent) => {
			const target = event.target as Element;
			if (target instanceof HTMLImageElement && target.dataset.svg !== undefined) {
				viewing = { src: target.src, alt: target.alt };
				return;
			}
			if (target instanceof HTMLImageElement && target.dataset.picture !== undefined) {
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
				event.preventDefault();
				viewing = { src: target.src, alt: target.alt };
				return;
			}
			const source = target.closest<HTMLElement>('[data-source]')?.dataset;
			if (source?.source)
				return files?.openSource(source.source, source.line ? Number(source.line) : undefined);
			const folder = target.closest<HTMLElement>('button[data-folder]')?.dataset.folder;
			if (folder) return files?.openFolder?.(folder);
			const file = target.closest<HTMLElement>('[data-file]')?.dataset.file;
			if (file) return files?.open(file);
			const button = target.closest<HTMLElement>('button[data-copy], button[data-run]');
			if (!button) return;
			const code = button.parentElement?.querySelector('pre')?.textContent;
			if (code == null) return;
			if (button.hasAttribute('data-run')) return onrun?.(code);
			await navigator.clipboard.writeText(code);
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
	bind:this={content}
	{@attach buttons}
	{@attach missingPictures}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it escapes raw HTML -->
	{@html html}
</div>

{#if viewing}<ImageViewer {...viewing} onclose={() => (viewing = null)} />{/if}
