<script lang="ts">
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { archiving } from './archive.svelte.ts';

	const asking = $derived(archiving.asking);
</script>

<!--
	Asks before a workspace with unfinished work is archived (FDR-001): briefly, saying what
	is unfinished about it. Once agreed to, it stays until the workspace is gone, which takes
	a moment (its worktree is removed). Render it once, in the layout.
-->
<Dialog
	bind:open={() => asking !== null, (open) => !open && !asking?.busy && asking?.answer(false)}
	label="Archive this workspace?"
	class="max-w-lg"
>
	<div class="space-y-4 p-6">
		<p class="heading">Archive this workspace?</p>
		<ul class="space-y-1.5 text-sm">
			{#each asking?.concerns ?? [] as concern (concern)}
				<li class="flex gap-2">
					<span class="mt-1 icon-[lucide--circle-alert] size-4 shrink-0 text-muted"></span>
					{concern}
				</li>
			{/each}
		</ul>
		<p class="text-sm text-muted">Its branch and its conversation are kept.</p>
		<div class="flex items-center justify-end gap-2">
			<Button disabled={asking?.busy} onclick={() => asking?.answer(false)}>Cancel</Button>
			<Button
				variant="primary"
				icon="icon-[lucide--archive]"
				busy={asking?.busy}
				onclick={() => asking?.answer(true)}
			>
				{asking?.busy ? 'Archiving…' : 'Archive'}
			</Button>
		</div>
	</div>
</Dialog>
