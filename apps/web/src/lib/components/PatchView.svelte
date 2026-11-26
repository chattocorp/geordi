<script lang="ts">
	import type { ToolDiff, TurnText } from '@geordi/protocol';
	import { onMount } from 'svelte';
	import { describeChange, diffInput, patchFiles } from '#lib/patch.ts';
	import TurnFile from './workspace/TurnFile.svelte';
	import DiffSection from '@geordi/ui/DiffSection.svelte';
	import DiffView from '@geordi/ui/DiffView.svelte';

	type Props = {
		/** What a tool call changed, as the agent said. */
		diff: ToolDiff;
		/** The session's worktree, so paths inside it are shown relative to it. */
		cwd?: string;
		collapsible?: boolean;
		load?: (path: string) => Promise<TurnText | null>;
	};
	let { diff, cwd, collapsible = false, load }: Props = $props();

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
	{#if diff.tooLarge && (!load || !files.some((file) => file.blobs))}
		<p class="text-muted">This change is too large to show here.</p>
	{/if}
	{#each files as file, i (i)}
		{@const historical =
			load &&
			!diff.fullContext &&
			(file.blobs
				? (file.added || file.removed) && file.blobs.old !== file.blobs.new
				: file.diff?.prevObjectId && file.diff.newObjectId)}
		{#if file.diff || historical}
			{@const patch = file.diff}
			{#snippet comparison()}
				{#if historical}
					<TurnFile {file} {load} />
				{:else if patch}
					<DiffView path={file.path} {...diffInput(patch, diff.fullContext)} />
				{/if}
			{/snippet}
			{#if collapsible}
				<DiffSection
					path={file.path}
					added={file.added ?? patch?.hunks.reduce((n, h) => n + h.additionLines, 0) ?? null}
					removed={file.removed ?? patch?.hunks.reduce((n, h) => n + h.deletionLines, 0) ?? null}
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
