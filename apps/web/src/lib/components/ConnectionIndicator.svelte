<script lang="ts">
	let { lost, class: extra }: { lost: boolean; class?: string } = $props();
</script>

<!-- Keep the live region ready to announce an outage, outside the layout until needed. -->
<span
	role="status"
	class={lost
		? ['flex items-center gap-1.5 text-xs whitespace-nowrap text-muted', extra]
		: 'sr-only'}
>
	{#if lost}
		<span class="icon-[lucide--unplug] size-3.5" aria-hidden="true"></span>
		Reconnecting
	{/if}
</span>
