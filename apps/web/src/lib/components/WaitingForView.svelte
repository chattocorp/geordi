<script lang="ts">
	let { lost }: { lost: boolean } = $props();
</script>

<p class="py-10 text-center text-sm text-muted">
	{lost ? 'Waiting for the forge connection.' : 'Loading…'}
</p>
