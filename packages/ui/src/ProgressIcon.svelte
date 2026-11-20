<script lang="ts">
	let { label, class: size = 'size-3.5' }: { label?: string; class?: string } = $props();
</script>

<span
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : true}
	title={label}
	class={['icon-[lucide--refresh-cw] shrink-0 motion-safe:animate-checks-spin', size]}
></span>
