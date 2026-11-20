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
		<ul class="scroller min-h-0 space-y-4 overflow-y-auto text-sm wrap-anywhere">
			{#each asking?.concerns ?? [] as concern, index (index)}
				<li>
					<p>{concern.label}</p>
					{#if concern.items?.length}
						<ul class="mt-1 list-disc space-y-0.5 pl-5 text-muted marker:text-muted">
							{#each concern.items as item, i (i)}
								<li>{item}</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="text-sm text-muted">Your conversations and Git branches are kept.</p>
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
