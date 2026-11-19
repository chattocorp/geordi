<script lang="ts">
	import type { ToolDiff } from '@geordi/protocol';
	import { describeChange, patchFiles, type PatchFile } from '#lib/patch.ts';
	import DiffView from '@geordi/ui/DiffView.svelte';

	type Props = {
		/** What a tool call changed, as the agent said. */
		diff: ToolDiff;
		/** The session's worktree, so paths inside it are shown relative to it. */
		cwd?: string;
	};
	let { diff, cwd }: Props = $props();

	/** `null` until the parser is loaded (with the viewer, on first use). */
	let files = $state<PatchFile[] | null>(null);
	$effect(() => {
		const [given, root] = [diff, cwd];
		let stale = false;
		import('@pierre/diffs').then(
			({ parsePatchFiles }) => {
				if (!stale) files = patchFiles(given, root, parsePatchFiles);
			},
			() => {
				if (!stale) files = patchFiles({ ...given, patch: undefined }, root, () => []);
			}
		);
		return () => {
			stale = true;
		};
	});
</script>

<!-- One file's change after another; each named, unless it is the only one (the row names it). -->
<div class="space-y-2">
	{#if diff.tooLarge}
		<p class="text-muted">This change is too large to show here.</p>
	{/if}
	{#each files ?? [] as file, i (i)}
		{#if file.diff}
			<div>
				{#if (files?.length ?? 0) > 1}
					<p class="mb-1 truncate code-dense text-muted">{file.path}</p>
				{/if}
				<div class="overflow-hidden rounded-control">
					<DiffView path={file.path} patch={file.diff} />
				</div>
			</div>
		{:else}
			<p class="truncate code-dense text-muted">{describeChange(file)}</p>
		{/if}
	{/each}
</div>
