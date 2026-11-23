<script lang="ts">
	import type { FileContent } from '@geordi/protocol';
	import { untrack } from 'svelte';
	import DiffView from '@geordi/ui/DiffView.svelte';
	import Markdown from '../Markdown.svelte';
	import ImageViewer from '#lib/ui/ImageViewer.svelte';
	import SoundPlayer from '#lib/ui/SoundPlayer.svelte';
	import SourceView from './SourceView.svelte';
	import { getWrapLines, type FileTools, type OnTools } from './window-tools.svelte.ts';

	let {
		path,
		current,
		old,
		line,
		pictures,
		wrap: given,
		ontools
	}: {
		path: string;
		current: FileContent | null;
		old?: FileContent | null;
		line?: number;
		pictures?: string;
		/** Whether long lines wrap: the workspace's preference, unless given. */
		wrap?: boolean;
		/** Called while the file is shown, with what can be done with it from the tab bar. */
		ontools?: OnTools;
	} = $props();
	const lines = getWrapLines();
	const wrap = $derived(given ?? lines.current);
	const diff = $derived(old !== undefined);
	/** A picture or sound whose bytes did not change (a file moved or copied as it is). */
	const same = $derived(
		typeof old === 'object' &&
			old !== null &&
			typeof current === 'object' &&
			current !== null &&
			old.mediaType === current.mediaType &&
			old.data === current.data
	);
	const binaryPair = $derived(
		old != null &&
			current !== null &&
			!same &&
			(typeof old === 'object' || typeof current === 'object')
	);
	const status = $derived(
		current === null
			? 'Deleted file'
			: diff && old === null
				? 'New file'
				: same
					? 'Content unchanged'
					: undefined
	);
	let mode = $derived(diff || line !== undefined ? 'text' : 'rendered');
	const file = $derived(current ?? old);

	type Preview = { src: string; sound: boolean };
	/** A picture or sound, as the browser shows it; SVG as its text. */
	function preview(content: FileContent | null | undefined): Preview | undefined {
		if (content && typeof content === 'object')
			return {
				src: `data:${content.mediaType};base64,${content.data}`,
				sound: content.mediaType.startsWith('audio/')
			};
		if (typeof content === 'string' && /\.svg$/i.test(path))
			return {
				src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`,
				sound: false
			};
	}
	const shown = $derived(preview(file));
	/** Both versions of a changed picture or sound, shown together. */
	const versions = $derived(
		binaryPair
			? [
					{ label: 'Before', preview: preview(old) },
					{ label: 'After', preview: preview(current) }
				]
			: undefined
	);
	const sounds = $derived(versions?.some((version) => version.preview?.sound));
	const markdown = $derived(typeof file === 'string' && /\.(md|markdown|mdown|mkd)$/i.test(path));
	const rich = $derived(Boolean(shown || markdown));
	/** How long each version of a changed sound is: both are drawn on the longer one's scale. */
	let durations = $state([0, 0]);
	let expanded = $state<string>();
	let failed = $state<string[]>([]);
	let ready = $state(false);

	/** What can be done with the file, from the window's tab bar. */
	const tools: FileTools = $derived({
		modes:
			rich && typeof file === 'string' && !binaryPair
				? {
						options: [
							{ value: 'rendered', label: 'Preview', icon: 'icon-[lucide--eye]' },
							diff
								? { value: 'text', label: 'Diff', icon: 'icon-[lucide--file-diff]' }
								: { value: 'text', label: 'Source', icon: 'icon-[lucide--code]' }
						],
						current: mode,
						select: (value: string) => (mode = value)
					}
				: undefined,
		// its text is on screen, as source or as a diff
		wrappable:
			typeof file === 'string' &&
			!binaryPair &&
			(!rich || mode === 'text') &&
			!(diff && old === current)
	});
	$effect(() => {
		const current = tools;
		if (ontools) return untrack(() => ontools(current));
	});
</script>

<!-- `paired`: one of two versions, beside the other: no taller than leaves both in view. -->
{#snippet show({ src, sound }: Preview, paired = false)}
	{@const svg = src.startsWith('data:image/svg+xml')}
	{#if failed.includes(src)}
		<p class="text-sm text-muted">This image could not be displayed.</p>
	{:else if sound}
		<div class="m-auto w-full max-w-prose card p-3"><SoundPlayer {src} label={path} /></div>
	{:else}
		<button
			type="button"
			class="flex max-h-full max-w-full cursor-zoom-in justify-center"
			class:mx-auto={!paired}
			class:w-full={svg}
			aria-label="Enlarge image"
			onclick={() => (expanded = src)}
		>
			<img
				{src}
				alt={path}
				class:w-full={svg}
				class="max-w-full rounded-control object-contain"
				class:max-h-full={!paired}
				class:max-h-96={paired}
				onerror={() => failed.push(src)}
			/>
		</button>
	{/if}
{/snippet}

{#if rich && status}
	<p class="px-5 text-xs text-muted">{status}</p>
{/if}

{#if versions && sounds}
	<!-- each version a pill of its own, the two in the middle of the pane -->
	<div class="scroller flex flex-col p-5">
		<div class="m-auto flex w-full max-w-prose flex-col gap-3">
			{#each versions as { label, preview }, index (label)}
				<div class="card p-3">
					{#if preview?.sound}
						<SoundPlayer
							src={preview.src}
							label={`${path}, ${label.toLowerCase()}`}
							caption={label}
							bind:duration={durations[index]}
							span={Math.max(...durations)}
						/>
					{:else}
						<p class="flex h-9 items-center gap-3 text-sm text-muted">
							<span class="w-12 label">{label}</span> No sound in this version.
						</p>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{:else if versions}
	<div class="scroller p-5">
		<div class="flex flex-wrap gap-5">
			{#each versions as { label, preview } (label)}
				<figure class="flex min-w-60 flex-1 flex-col gap-2">
					<figcaption class="label">{label}</figcaption>
					{#if preview}
						{@render show(preview, true)}
					{:else}
						<p class="text-sm text-muted">No preview of this version.</p>
					{/if}
				</figure>
			{/each}
		</div>
	</div>
{:else if rich && (mode === 'rendered' || typeof file !== 'string')}
	<div class="scroller p-5" class:flex={shown?.sound}>
		{#if shown}
			{@render show(shown)}
		{:else if typeof file === 'string'}
			<div class="mx-auto max-w-prose"><Markdown text={file} documentPath={path} {pictures} /></div>
		{/if}
	</div>
{:else if !diff}
	{#if typeof file === 'string'}<SourceView {path} text={file} {line} {wrap} />{/if}
{:else if old === current}
	<p class="p-5 text-sm text-muted">The file's content is unchanged.</p>
{:else}
	<div class="scroller">
		{#if !ready}<p class="p-5 text-sm text-muted" role="status">Loading the diff…</p>{/if}
		<DiffView
			{path}
			old={typeof old === 'string' ? old : null}
			new={typeof current === 'string' ? current : null}
			{wrap}
			bind:ready
		/>
	</div>
{/if}

{#if expanded}<ImageViewer src={expanded} alt={path} onclose={() => (expanded = undefined)} />{/if}
