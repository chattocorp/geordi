<script lang="ts">
	let { workspaceHref, worded = false }: { workspaceHref: string; worded?: boolean } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller resolves the workspace path -->
<a
	href={`${workspaceHref}?question`}
	aria-label="Open agent question"
	title="Open agent question"
	class={[
		'inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-accent-ink hover:bg-hover',
		worded ? 'px-2 py-1' : 'size-6 bg-accent-soft'
	]}
>
	<span class="icon-[lucide--message-circle-question] size-4"></span>
	{#if worded}Waiting for your answer{/if}
</a>
