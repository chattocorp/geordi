<script lang="ts">
	let { workspaceHref, worded = false }: { workspaceHref: string; worded?: boolean } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller resolves the workspace path -->
<a
	href={`${workspaceHref}?question`}
	aria-label="Open agent question"
	title="Open agent question"
	class={[
		'text-accent-ink hover:bg-hover',
		worded
			? 'inline-flex items-center gap-2 rounded-full px-2 py-1'
			: 'indicator-action bg-accent-soft'
	]}
>
	<span class="icon-[lucide--message-circle-question] size-4 shrink-0"></span>
	{#if worded}<span class="@max-2xl/titlebar:sr-only">
			Waiting for your answer
		</span>{:else}Answer{/if}
</a>
