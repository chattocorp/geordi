<script lang="ts">
	import type { FileContent } from '@geordi/protocol';
	import DiffView from '@geordi/ui/DiffView.svelte';
	import Toolbar from '@geordi/ui/Toolbar.svelte';
	import Markdown from '../Markdown.svelte';
	import ImageViewer from '#lib/ui/ImageViewer.svelte';
	import SourceView from './SourceView.svelte';

	let {
		path,
		current,
		old,
		line,
		pictures
	}: {
		path: string;
		current: FileContent | null;
		old?: FileContent | null;
		line?: number;
		pictures?: string;
	} = $props();
	const diff = $derived(old !== undefined);
	const binaryPair = $derived(
		old != null && current !== null && (typeof old === 'object' || typeof current === 'object')
	);
	let side = $state('after');
	let mode = $derived(diff || line !== undefined ? 'text' : 'rendered');
	const file = $derived((binaryPair && side === 'before' ? old : current) ?? old);
	const media = $derived(
		file && typeof file === 'object' ? `data:${file.mediaType};base64,${file.data}` : undefined
	);
	const sound = $derived(media?.startsWith('data:audio/') ? media : undefined);
	const image = $derived(
		media && !sound
			? media
			: typeof file === 'string' && /\.svg$/i.test(path)
				? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(file)}`
				: undefined
	);
	const markdown = $derived(typeof file === 'string' && /\.(md|markdown|mdown|mkd)$/i.test(path));
	const rich = $derived(Boolean(image || sound || markdown));
	let expanded = $state(false);
	let failed = $state<string>();
	let ready = $state(false);
</script>

{#if binaryPair}
	<Toolbar
		label="File version"
		items={[
			{
				label: 'Before',
				icon: 'icon-[lucide--history]',
				pressed: side === 'before',
				onclick: () => (side = 'before')
			},
			{
				label: 'After',
				icon: sound ? 'icon-[lucide--audio-lines]' : 'icon-[lucide--image]',
				pressed: side === 'after',
				onclick: () => (side = 'after')
			}
		]}
	/>
{:else if rich && typeof file === 'string'}
	<Toolbar
		label="File view"
		status={current === null ? 'Deleted file' : undefined}
		items={[
			{
				label: 'Preview',
				icon: 'icon-[lucide--eye]',
				pressed: mode === 'rendered',
				onclick: () => (mode = 'rendered')
			},
			{
				label: diff ? 'Diff' : 'Source',
				icon: diff ? 'icon-[lucide--file-diff]' : 'icon-[lucide--code]',
				pressed: mode === 'text',
				onclick: () => (mode = 'text')
			}
		]}
	/>
{:else if (image || sound) && current === null}
	<p class="px-5 text-xs text-muted">Deleted file</p>
{/if}

{#if rich && (mode === 'rendered' || typeof file !== 'string')}
	<div class="scroller p-5">
		{#if sound}
			{#if failed === sound}
				<p class="text-sm text-muted">This sound could not be played.</p>
			{:else}
				<audio
					controls
					src={sound}
					aria-label={path}
					class="mx-auto w-full max-w-prose"
					onerror={() => (failed = sound)}
				></audio>
			{/if}
		{:else if image}
			{#if failed === image}
				<p class="text-sm text-muted">This image could not be displayed.</p>
			{:else}
				<button
					type="button"
					class="mx-auto flex max-h-full max-w-full cursor-zoom-in justify-center"
					class:w-full={image.startsWith('data:image/svg+xml')}
					aria-label="Enlarge image"
					onclick={() => (expanded = true)}
				>
					<img
						src={image}
						alt={path}
						class:w-full={image.startsWith('data:image/svg+xml')}
						class="max-h-full max-w-full rounded-control object-contain"
						onerror={() => (failed = image)}
					/>
				</button>
				{#if expanded}<ImageViewer src={image} alt={path} onclose={() => (expanded = false)} />{/if}
			{/if}
		{:else if typeof file === 'string'}
			<div class="mx-auto max-w-prose"><Markdown text={file} documentPath={path} {pictures} /></div>
		{/if}
	</div>
{:else if !diff || binaryPair}
	{#if typeof file === 'string'}<SourceView {path} text={file} {line} />{/if}
{:else if old === current}
	<p class="p-5 text-sm text-muted">The file's content is unchanged.</p>
{:else}
	<div class="scroller">
		{#if !ready}<p class="p-5 text-sm text-muted" role="status">Loading the diff…</p>{/if}
		<DiffView
			{path}
			old={typeof old === 'string' ? old : null}
			new={typeof current === 'string' ? current : null}
			bind:ready
		/>
	</div>
{/if}
