<script lang="ts">
	import type { FileContent } from '@geordi/protocol';
	import DiffView from '@geordi/ui/DiffView.svelte';
	import Markdown from '../Markdown.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
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
	let mode = $derived(line === undefined ? 'rendered' : 'text');
	const file = $derived((binaryPair && side === 'before' ? old : current) ?? old);
	const image = $derived(
		file && typeof file === 'object'
			? `data:${file.mediaType};base64,${file.data}`
			: typeof file === 'string' && /\.svg$/i.test(path)
				? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(file)}`
				: undefined
	);
	const markdown = $derived(typeof file === 'string' && /\.(md|markdown|mdown|mkd)$/i.test(path));
	const rich = $derived(Boolean(image || markdown));
	let expanded = $state(false);
	let failed = $state<string>();
	let ready = $state(false);
</script>

{#if binaryPair || (rich && (typeof file === 'string' || (diff && current === null)))}
	<div class="flex items-center justify-between gap-3 px-5 pt-4">
		{#if binaryPair}
			<Segmented
				label="Image version"
				bind:value={side}
				options={[
					{ value: 'before', label: 'Before' },
					{ value: 'after', label: 'After' }
				]}
			/>
		{:else if typeof file === 'string'}
			<Segmented
				label="File view"
				bind:value={mode}
				options={[
					{ value: 'rendered', label: 'Preview' },
					{ value: 'text', label: diff ? 'Diff' : 'Source' }
				]}
			/>
		{/if}
		{#if diff && current === null}<span class="text-sm text-muted">Deleted file</span>{/if}
	</div>
{/if}

{#if rich && (mode === 'rendered' || typeof file !== 'string')}
	<div class="scroller p-5">
		{#if image}
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
	{#if typeof file === 'string'}<SourceView text={file} {line} />{/if}
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
