<script lang="ts">
	let { lost }: { lost: boolean } = $props();
</script>

<!-- Reserve the same space through a disconnect so adjacent controls stay put. -->
<span role="status" class="inline-flex items-center text-xs whitespace-nowrap text-muted">
	<span class={['flex items-center gap-1.5', !lost && 'invisible']}>
		<span class="icon-[lucide--unplug] size-3.5" aria-hidden="true"></span>
		Reconnecting
	</span>
</span>
