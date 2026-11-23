<script lang="ts">
	/**
	 * Something that runs, in gold. One that listens on ports is ready to be looked at: a play
	 * mark. One that has none simply works away: the turning arrows of something under way
	 * (as `ProgressIcon`), in gold.
	 */
	let {
		label = 'Running',
		listens = true,
		class: size = 'size-4'
	}: { label?: string; listens?: boolean; class?: string } = $props();
</script>

<span
	class={[
		'shrink-0 text-accent',
		listens
			? 'bar-running icon-[lucide--play]'
			: 'icon-[lucide--refresh-cw] motion-safe:animate-checks-spin',
		size
	]}
	role="img"
	aria-label={label}
	title={label}
></span>
