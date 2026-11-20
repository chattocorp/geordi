<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import type { JobState } from './JobMark.svelte';

	let { state, start, stop }: { state: JobState; start: () => void; stop: () => void } = $props();
</script>

<div class="flex items-center gap-2 px-3 text-xs text-muted">
	{#if state === 'starting'}
		<span>Starting…</span>
	{:else if state === 'running'}
		<span>Running</span>
		<Button variant="ghost" size="sm" onclick={stop}>Stop</Button>
	{:else}
		<span>{typeof state === 'object' ? `Exited ${state.ended}` : 'Stopped'}</span>
		<Button variant="ghost" size="sm" onclick={start}>Start again</Button>
	{/if}
</div>
