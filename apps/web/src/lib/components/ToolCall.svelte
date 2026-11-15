<script lang="ts">
	import { toolIcon, toolSummary } from '#lib/tools.ts';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Props = {
		name: string;
		input: string;
		output: string | null;
		isError: boolean;
		/** The session's worktree, so paths inside it can be shown relative to it. */
		cwd?: string;
	};
	let { name, input, output, isError, cwd }: Props = $props();

	const summary = $derived(toolSummary(input, cwd));
	const pending = $derived(output === null);
</script>

<details class="group">
	<summary
		class="flex list-none items-center gap-3 px-3.5 py-2 text-sm select-none hover:bg-sunken/70 [&::-webkit-details-marker]:hidden"
	>
		<span
			class={[
				'grid size-6 shrink-0 place-items-center rounded-control',
				isError ? 'bg-danger-soft text-danger' : 'bg-sunken text-muted'
			]}
		>
			<span class={['size-3.5', toolIcon(name)]}></span>
		</span>
		<span class="shrink-0 font-medium">{name}</span>
		<span class="min-w-0 flex-1 truncate code-dense text-muted">{summary}</span>
		{#if pending}
			<Spinner label="Running" />
		{:else if isError}
			<span class="sr-only">Failed</span>
		{/if}
		<span
			class="icon-[lucide--chevron-right] size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
		></span>
	</summary>

	<div class="mx-3.5 mb-3 overflow-hidden rounded-control bg-sunken code-dense">
		{#if input && input !== summary}
			<pre class="overflow-x-auto p-3 whitespace-pre-wrap">{input}</pre>
		{/if}
		{#if output}
			<pre
				class={[
					'max-h-96 overflow-auto border-t border-line/70 p-3 whitespace-pre-wrap first:border-t-0',
					isError && 'text-danger'
				]}>{output}</pre>
		{:else if !pending}
			<p class="p-3 text-muted">No output.</p>
		{/if}
	</div>
</details>
