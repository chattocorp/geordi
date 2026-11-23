<script lang="ts">
	import { highlightFile } from '#lib/highlightFile.ts';

	let {
		path,
		text,
		line,
		wrap = false
	}: { path: string; text: string; line?: number; wrap?: boolean } = $props();
	const lines = $derived(text.replace(/\r?\n$/, '').split(/\r?\n/));
	const selected = $derived(line !== undefined && line >= 1 && line <= lines.length);
	const highlighted = $derived(highlightFile(path, text, selected ? line : undefined));
</script>

<div class="scroller p-4" class:wrap>
	{#if line !== undefined && !selected}
		<p class="mb-2 text-sm text-muted">Line {line} is outside this file.</p>
	{/if}
	{#snippet plain()}
		{#if selected && line}
			<pre class="code-dense">{line > 1 ? lines.slice(0, line - 1).join('\n') + '\n' : ''}<mark
					class="tone-accent"
					aria-label={`Line ${line}`}
					{@attach (node) => {
						node.scrollIntoView({ block: 'center', inline: 'nearest' });
					}}>{lines[line - 1] || ' '}</mark
				>{line < lines.length ? '\n' + lines.slice(line).join('\n') : ''}</pre>
		{:else}
			<pre class="code-dense">{text}</pre>
		{/if}
	{/snippet}
	{#await highlighted}
		{@render plain()}
	{:then html}
		{#if html}
			<div
				class="code-dense"
				{@attach (node) => {
					void html;
					node.querySelector('mark')?.scrollIntoView({ block: 'center', inline: 'nearest' });
				}}
			>
				<!-- Shiki escapes source text before it adds token markup. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html html}
			</div>
		{:else}
			{@render plain()}
		{/if}
	{:catch}
		{@render plain()}
	{/await}
</div>

<style>
	/* Long lines wrap where they must, even inside a word, rather than scroll sideways. */
	.wrap :global(pre) {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
