<script lang="ts">
	import type { ToolDiff } from '@geordi/protocol';
	import { describeChange, patchFiles, type PatchFile } from '#lib/patch.ts';
	import Disclosure from '@geordi/ui/Disclosure.svelte';
	import FittedPath from '@geordi/ui/FittedPath.svelte';
	import DiffStat from '@geordi/ui/DiffStat.svelte';
	import DiffView from '@geordi/ui/DiffView.svelte';

	type Props = {
		/** What a tool call changed, as the agent said. */
		diff: ToolDiff;
		/** The session's worktree, so paths inside it are shown relative to it. */
		cwd?: string;
		collapsible?: boolean;
	};
	let { diff, cwd, collapsible = false }: Props = $props();

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
		{#if file.diff && collapsible}
			{@const patch = file.diff}
			<Disclosure
				open={true}
				class="rounded-card bg-surface p-1"
				summaryClass="px-2 py-1.5 hover:bg-hover"
			>
				{#snippet heading()}
					<span class="icon-[lucide--file-code] size-3.5 shrink-0 text-muted"></span>
					<span class="flex min-w-0 flex-1 code-dense" title={file.path}
						><FittedPath path={file.path} /></span
					>
					<DiffStat
						added={patch.hunks.reduce((n, h) => n + h.additionLines, 0)}
						removed={patch.hunks.reduce((n, h) => n + h.deletionLines, 0)}
					/>
				{/snippet}
				<div class="overflow-hidden rounded-control"><DiffView path={file.path} {patch} /></div>
			</Disclosure>
		{:else if file.diff}
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
