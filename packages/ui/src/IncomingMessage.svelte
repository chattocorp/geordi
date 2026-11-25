<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A message another agent sent: on a card in the agents' column, below the reply it
	 * answers. The first of a run carries the arrow, in the place of an agent's avatar.
	 * `heading` names the sender; with `fold`, the heading folds the message away.
	 */
	let {
		first = true,
		heading,
		fold,
		children,
		footer
	}: {
		first?: boolean;
		heading: Snippet;
		fold?: { open: boolean; toggle(): void };
		children?: Snippet;
		footer?: Snippet;
	} = $props();

	const open = $derived(!fold || fold.open);
</script>

<div class="group/message flex gap-3.5">
	<span aria-hidden="true" class="grid h-10 w-8 shrink-0 place-items-center text-faint">
		{#if first}<span class="icon-[lucide--corner-down-right] size-4"></span>{/if}
	</span>
	<div class="max-w-prose min-w-0 flex-1">
		<div class="w-fit max-w-full card rounded-tl-control">
			{#if fold}
				<button
					type="button"
					aria-expanded={fold.open}
					class="flex w-full items-center gap-2 rounded-card rounded-tl-control px-3.5 py-2.5 text-left text-xs text-muted hover:text-ink"
					onclick={fold.toggle}
				>
					<span class="min-w-0 wrap-anywhere">{@render heading()}</span>
					<span
						aria-hidden="true"
						class={[
							'ml-auto icon-[lucide--chevron-right] size-4 shrink-0 transition-transform motion-reduce:transition-none',
							fold.open && 'rotate-90'
						]}
					></span>
				</button>
			{:else}
				<p class="px-3.5 pt-2.5 text-xs wrap-anywhere text-muted">{@render heading()}</p>
			{/if}
			{#if open && children}
				<div class={['px-3.5 pb-3', fold ? 'pt-0' : 'pt-1']}>{@render children()}</div>
			{/if}
		</div>
		{#if open && footer}
			<div
				class="mt-1 flex items-center gap-1 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/message:opacity-100 pointer-fine:focus-within:opacity-100"
			>
				{@render footer()}
			</div>
		{/if}
	</div>
</div>
