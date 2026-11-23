<script lang="ts">
	import ProgressIcon from './ProgressIcon.svelte';

	/**
	 * What a pane shows until its content is there: a quiet word in its middle, where an
	 * empty pane says it has nothing, so that neither moves the eye when the other follows.
	 */
	let { label = 'Loading…' }: { label?: string } = $props();
</script>

<div
	role="status"
	class="flex min-h-full flex-1 items-center justify-center gap-2 p-5 text-sm text-muted"
>
	<ProgressIcon />
	{label}
</div>
