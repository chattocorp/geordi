<script module lang="ts">
	/** How a job is: not running, on its way up (until it listens on its port), up, or over. */
	export type JobState = 'stopped' | 'starting' | 'running' | { ended: number };
</script>

<script lang="ts">
	import ProgressIcon from '@geordi/ui/ProgressIcon.svelte';

	/** How a job is, as a mark: shown beside its terminal name. */
	let { state, class: size = 'size-3.5' }: { state: JobState; class?: string } = $props();
</script>

{#if state === 'starting'}
	<ProgressIcon label="Starting" class={size} />
{:else if state === 'running'}
	<span class="dot shrink-0 dot-live" role="img" aria-label="Running" title="Running"></span>
{:else if state === 'stopped'}
	<span class={['grid shrink-0 place-items-center', size]} title="Not running">
		<span class="dot"></span>
	</span>
{:else if state.ended === 0}
	<span class={['icon-[lucide--check] shrink-0 text-muted', size]} title="Ended"></span>
{:else}
	<span
		class={['icon-[lucide--x] shrink-0 text-danger', size]}
		title="Ended with status {state.ended}"
	></span>
{/if}
