<script lang="ts">
	import Badge from '#lib/ui/Badge.svelte';

	/** Whether an agent (or anything in a workspace) is working right now. */
	let { running }: { running: boolean } = $props();
</script>

<Badge tone={running ? 'accent' : 'neutral'} dot>{running ? 'Working' : 'Idle'}</Badge>
