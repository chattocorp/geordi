<script lang="ts">
	import { getChanges, getDiff } from '../../../routes/workspaces.remote';

	let { workspaceId, path }: { workspaceId: string; path: string } = $props();

	const diff = $derived(getDiff({ workspaceId, path }));

	// Reload whenever the changes pane (which polls) sees this file change.
	const changes = $derived(getChanges(workspaceId));
	const stats = $derived(changes.current?.files.find((file) => file.path === path));
	$effect(() => {
		void [stats?.added, stats?.removed];
		diff.refresh();
	});

	const tone = (line: string) => {
		if (line.startsWith('@@')) return 'bg-accent-soft/60 text-accent-ink';
		if (line.startsWith('+++') || line.startsWith('---')) return 'text-muted';
		if (line.startsWith('+')) return 'bg-ok/10 text-ok';
		if (line.startsWith('-')) return 'bg-danger/10 text-danger';
		if (/^(diff|index|new file|deleted file|old mode|new mode|similarity|rename) /.test(line))
			return 'text-muted';
		return '';
	};
</script>

<div class="min-h-0 flex-1 overflow-auto code-dense">
	{#if diff.current === undefined}
		<p class="p-5 font-sans text-sm text-muted">Loading…</p>
	{:else if diff.current === ''}
		<p class="p-5 font-sans text-sm text-muted">This file has no changes any more.</p>
	{:else}
		<div class="w-max min-w-full py-3">
			{#each diff.current.replace(/\n$/, '').split('\n') as line, i (i)}
				<div class={['px-5 whitespace-pre', tone(line)]}>{line || ' '}</div>
			{/each}
		</div>
	{/if}
</div>
