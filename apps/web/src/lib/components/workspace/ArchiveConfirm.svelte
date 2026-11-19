<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import type { ArchiveQuestion } from './archive.svelte.ts';

	let { asking }: { asking: ArchiveQuestion | null } = $props();
	const heading = $derived(`Archive “${asking?.title ?? ''}”?`);
</script>

<Dialog
	bind:open={() => asking !== null, (open) => !open && !asking?.busy && asking?.answer(false)}
	label={heading}
	class="max-w-lg"
>
	<div class="space-y-4 p-6">
		<p class="heading wrap-anywhere">{heading}</p>
		<ul class="space-y-1.5 text-sm">
			{#each asking?.concerns ?? [] as concern (concern)}
				<li class="flex gap-2">
					<span class="mt-1 icon-[lucide--circle-alert] size-4 shrink-0 text-muted"></span>
					{concern}
				</li>
			{/each}
		</ul>
		<p class="text-sm text-muted">
			Archiving ends its terminals and keeps its branch and conversation.
		</p>
		<div class="dialog-actions">
			<Button variant="soft" disabled={asking?.busy} onclick={() => asking?.answer(false)}
				>Cancel</Button
			>
			<Button
				variant="primary"
				disabled={asking?.blocked}
				busy={asking?.busy}
				onclick={() => asking?.answer(true)}
			>
				Archive
			</Button>
		</div>
	</div>
</Dialog>
