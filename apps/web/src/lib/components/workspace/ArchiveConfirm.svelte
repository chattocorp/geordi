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
	class="max-w-lg open:flex open:flex-col"
>
	<div class="flex min-h-0 flex-col gap-4 p-6">
		<p class="heading wrap-anywhere">{heading}</p>
		<ul
			class="scroller min-h-0 list-disc space-y-1 overflow-y-auto pl-5 text-sm wrap-anywhere marker:text-muted"
		>
			{#each asking?.concerns ?? [] as concern (concern)}
				<li>{concern}</li>
			{/each}
		</ul>
		<p class="text-sm text-muted">
			{asking?.missingCheckout
				? 'You can still read your conversations in Archive. To resume work, restore the checkout first.'
				: 'Your conversations and Git branches are kept.'}
		</p>
		<div class="dialog-actions">
			<Button variant="soft" disabled={asking?.busy} onclick={() => asking?.answer(false)}>
				Cancel
			</Button>
			<Button variant="primary" busy={asking?.busy} onclick={() => asking?.answer(true)}>
				{asking?.stopAgents ? 'Stop and archive' : 'Archive'}
			</Button>
		</div>
	</div>
</Dialog>
