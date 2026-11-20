<script lang="ts">
	let { label = 'Running', class: size = 'size-4' }: { label?: string; class?: string } = $props();
</script>

<span
	class={['bar-running icon-[lucide--play] shrink-0 text-accent', size]}
	role="img"
	aria-label={label}
	title={label}
></span>
