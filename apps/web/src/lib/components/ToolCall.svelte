<script lang="ts">
	import type { ToolDiff, ToolInfo } from '@geordi/protocol';
	import { changedFiles } from '#lib/changedFiles.ts';
	import Disclosure from '#lib/ui/Disclosure.svelte';
	import { filesOf, iconOf, relativeTo, titleOf } from '#lib/tools.ts';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PatchView from './PatchView.svelte';
	import ToolTitle from './ToolTitle.svelte';

	type Props = ToolInfo & {
		name: string;
		input: string;
		output: string | null;
		isError: boolean;
		/** What it changed in files, if the agent said: shown instead of its input and output. */
		diff?: ToolDiff;
		/** The session's worktree, so paths inside it can be shown relative to it. */
		cwd?: string;
		/** Whether it is running right now. One without output in a turn that is over never finished. */
		running?: boolean;
	};
	let { output, isError, diff, cwd, running = false, ...tool }: Props = $props();

	let open = $state(false);

	const parts = $derived(titleOf(tool, cwd));
	const pending = $derived(running && output === null);
	/** What the title does not already say of its input. */
	const input = $derived(
		tool.input === '{}' || (parts.length === 2 && parts[1].text === tool.input)
			? ''
			: relativeTo(cwd, tool.input)
	);

	// The files it names lead to them, in the workspace: to the changes made to a file it
	// changed, else to the file.
	const workspace = changedFiles();
	const files = $derived(workspace ? filesOf(tool.locations, cwd ?? workspace.root) : []);
	const changes = $derived(
		tool.toolKind === 'edit' || tool.toolKind === 'delete' || tool.toolKind === 'move'
	);
	function show(path: string, line?: number) {
		if (changes && workspace?.paths.has(path)) workspace.open(path);
		else workspace?.openSource(path, line);
	}
</script>

<Disclosure bind:open summaryClass="px-3.5 py-2 text-sm hover:bg-hover">
	{#snippet heading()}
		<span
			class={[
				'grid size-6 shrink-0 place-items-center rounded-control',
				isError ? 'bg-danger-soft text-danger' : 'bg-sunken text-muted'
			]}
		>
			<span class={['size-3.5', iconOf(tool)]}></span>
		</span>
		<ToolTitle {parts} class="flex-1" />
		{#if pending}
			<Spinner label="Running" />
		{:else if isError}
			<span class="sr-only">Failed</span>
		{/if}
	{/snippet}

	{#if files.length}
		<p class="mx-3.5 mb-2 flex flex-wrap gap-x-3 code-dense">
			{#each files as { path, line } (path)}
				<button type="button" class="file-link" onclick={() => show(path, line)}>
					{path}{line && line > 1 ? `:${line}` : ''}
				</button>
			{/each}
		</p>
	{/if}
	{#if diff}
		<!-- drawn only once opened: the viewer is loaded on first use -->
		<div class="mx-3.5 mb-3">
			{#if open}<PatchView {diff} {cwd} />{/if}
		</div>
	{:else}
		<div class="mx-3.5 mb-3 overflow-hidden rounded-control bg-sunken code-dense">
			{#if input}
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
	{/if}
</Disclosure>
