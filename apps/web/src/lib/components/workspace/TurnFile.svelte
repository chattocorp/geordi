<script lang="ts">
	import DiffView from '@geordi/ui/DiffView.svelte';
	import { describeChange, type PatchFile } from '#lib/patch.ts';
	import type { TurnText } from '@geordi/protocol';

	let { file, load }: { file: PatchFile; load: (path: string) => Promise<TurnText | null> } =
		$props();
	let versions = $state.raw<TurnText | null>(null);
	function observe(node: HTMLElement) {
		const path = file.path;
		const read = load;
		let stale = false;
		const observer = new IntersectionObserver(([entry]) => {
			if (!entry.isIntersecting) return;
			observer.disconnect();
			read(path).then(
				(result) => {
					if (!stale) versions = result;
				},
				() => {}
			);
		});
		observer.observe(node);
		return () => {
			stale = true;
			observer.disconnect();
		};
	}
</script>

<div {@attach observe}>
	{#if versions}
		<DiffView path={file.path} {...versions} />
	{:else if file.diff}
		<DiffView path={file.path} patch={file.diff} />
	{:else}
		<p class="truncate code-dense text-muted">{describeChange(file)}</p>
	{/if}
</div>
