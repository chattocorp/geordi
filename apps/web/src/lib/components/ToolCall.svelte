<script lang="ts">
	import Disclosure from '#lib/ui/Disclosure.svelte';
	import { toolIcon, toolSummary } from '#lib/tools.ts';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Props = {
		name: string;
		input: string;
		output: string | null;
		isError: boolean;
		/** The session's worktree, so paths inside it can be shown relative to it. */
		cwd?: string;
		/** Whether it is running right now. One without output in a turn that is over never finished. */
		running?: boolean;
	};
	let { name, input, output, isError, cwd, running = false }: Props = $props();

	const summary = $derived(toolSummary(input, cwd));
	const pending = $derived(running && output === null);
</script>

<Disclosure summaryClass="px-3.5 py-2 text-sm hover:bg-sunken/70">
	{#snippet heading()}
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
	{/snippet}

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
			<p class="p-3 text-muted">{output === null ? 'It was interrupted.' : 'No output.'}</p>
		{/if}
	</div>
</Disclosure>
