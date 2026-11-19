<script lang="ts">
	import type { FileContent } from '@geordi/protocol';
	import DiffView from '@geordi/ui/DiffView.svelte';
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

{#snippet viewChoice(label: string, active: boolean, choose: () => void)}
	<button
		type="button"
		aria-pressed={active}
		onclick={choose}
		class={[
			'h-7 text-xs hover:text-ink',
			active ? 'font-semibold text-ink underline decoration-2 underline-offset-4' : 'text-muted'
		]}>{label}</button
	>
{/snippet}

{#if binaryPair || (rich && (typeof file === 'string' || (diff && current === null)))}
	<div class="flex shrink-0 items-center gap-4 px-5">
		{#if binaryPair}
			<div role="group" aria-label="Image version" class="flex items-center gap-4">
				{@render viewChoice('Before', side === 'before', () => (side = 'before'))}
				{@render viewChoice('After', side === 'after', () => (side = 'after'))}
			</div>
		{:else if typeof file === 'string'}
			<div role="group" aria-label="File view" class="flex items-center gap-4">
				{@render viewChoice('Preview', mode === 'rendered', () => (mode = 'rendered'))}
				{@render viewChoice(diff ? 'Diff' : 'Source', mode === 'text', () => (mode = 'text'))}
			</div>
		{/if}
		{#if diff && current === null}<span class="ml-auto text-xs text-muted">Deleted file</span>{/if}
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
