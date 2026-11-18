<script lang="ts">
	let { text, line }: { text: string; line?: number } = $props();
	const lines = $derived(text.replace(/\r?\n$/, '').split(/\r?\n/));
	const selected = $derived(line !== undefined && line >= 1 && line <= lines.length);
</script>

<div class="scroller p-4">
	{#if line !== undefined && !selected}
		<p class="mb-2 text-sm text-muted">Line {line} is outside this file.</p>
	{/if}
	{#if selected && line}
		<pre class="code-dense">{line > 1 ? lines.slice(0, line - 1).join('\n') + '\n' : ''}<mark
				class="bg-accent-soft text-accent-ink"
				aria-label={`Line ${line}`}
				{@attach (node) => {
					node.scrollIntoView({ block: 'center', inline: 'nearest' });
				}}>{lines[line - 1] || ' '}</mark
			>{line < lines.length ? '\n' + lines.slice(line).join('\n') : ''}</pre>
	{:else}
		<pre class="code-dense">{text}</pre>
	{/if}
</div>
