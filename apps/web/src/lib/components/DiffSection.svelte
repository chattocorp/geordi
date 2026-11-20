<script lang="ts">
	import type { Snippet } from 'svelte';
	import Disclosure from '@geordi/ui/Disclosure.svelte';
	import FittedPath from '@geordi/ui/FittedPath.svelte';
	import DiffStat from '@geordi/ui/DiffStat.svelte';

	let {
		path,
		added,
		removed,
		children
	}: {
		path: string;
		added: number | null;
		removed: number | null;
		children: Snippet;
	} = $props();
</script>

<Disclosure
	open={true}
	class="rounded-card bg-surface p-1"
	summaryClass="px-2 py-1.5 hover:bg-hover"
>
	{#snippet heading()}
		<span class="icon-[lucide--file-code] size-3.5 shrink-0 text-muted"></span>
		<span class="flex min-w-0 flex-1 code-dense" title={path}><FittedPath {path} /></span>
		<DiffStat {added} {removed} />
	{/snippet}
	<div class="overflow-hidden rounded-control">{@render children()}</div>
</Disclosure>
