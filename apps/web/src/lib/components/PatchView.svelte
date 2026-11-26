<script lang="ts">
	import type { ToolDiff } from '@geordi/protocol';
	import { onMount } from 'svelte';
	import { describeChange, diffInput, patchFiles } from '#lib/patch.ts';
	import DiffSection from '@geordi/ui/DiffSection.svelte';
	import DiffView from '@geordi/ui/DiffView.svelte';

	type Props = {
		/** What a tool call changed, as the agent said. */
		diff: ToolDiff;
		/** The session's worktree, so paths inside it are shown relative to it. */
		cwd?: string;
		collapsible?: boolean;
	};
	let { diff, cwd, collapsible = false }: Props = $props();

	// Load the browser viewer once. If it fails to load, keep the file summaries.
	let parser = $state.raw<typeof import('@pierre/diffs').parsePatchFiles>();
	onMount(async () => {
		parser = await import('@pierre/diffs').then(
			(module) => module.parsePatchFiles,
			() => () => []
		);
	});
	const files = $derived(parser ? patchFiles(diff, cwd, parser) : []);
</script>

<!-- One file's change after another; each named, unless it is the only one (the row names it). -->
<div class="space-y-2">
	{#if diff.tooLarge}
		<p class="text-muted">This change is too large to show here.</p>
	{/if}
	{#each files as file, i (i)}
		{#if file.diff}
			{@const patch = file.diff}
			{#snippet comparison()}
				<DiffView path={file.path} {...diffInput(patch, diff.fullContext)} />
			{/snippet}
			{#if collapsible}
				<DiffSection
					path={file.path}
					added={patch.hunks.reduce((n, h) => n + h.additionLines, 0)}
					removed={patch.hunks.reduce((n, h) => n + h.deletionLines, 0)}
				>
					{@render comparison()}
				</DiffSection>
			{:else}
				<div>
					{#if files.length > 1}
						<p class="mb-1 truncate code-dense text-muted">{file.path}</p>
					{/if}
					<div class="overflow-hidden rounded-control">
						{@render comparison()}
					</div>
				</div>
			{/if}
		{:else}
			<p class="truncate code-dense text-muted">{describeChange(file)}</p>
		{/if}
	{/each}
</div>
