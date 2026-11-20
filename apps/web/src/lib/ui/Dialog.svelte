<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Whether it is showing. Escape and a click beside it close it. */
		open: boolean;
		/** What the dialog is, for those who can't see it. */
		label: string;
		/** Choose the initial focus when this dialog opens. */
		onopen?: () => void;
		class?: string;
		children: Snippet;
	};
	let { open = $bindable(), label, onopen, class: extra, children }: Props = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (open && !dialog.open) {
			dialog.showModal();
			// The browser puts the focus on the first thing in it, ringed when the dialog was
			// opened from the keyboard: a mark on something nobody chose. It starts on the
			// dialog itself; Tab goes on from there, and shows where it is.
			if (onopen) onopen();
			else dialog.focus();
		}
		if (!open && dialog.open) dialog.close();
	});
</script>

<!--
	A window over the page that wants dealing with before anything else: the page behind it
	can't be used meanwhile. For a set of choices rather than a single question.
-->
<dialog
	bind:this={dialog}
	aria-label={label}
	tabindex="-1"
	onclose={() => (open = false)}
	onclick={(event) => event.target === dialog && (open = false)}
	class={[
		'm-auto max-h-5/6 w-full overflow-hidden card-float p-0 text-ink outline-none backdrop:bg-bg/70',
		'max-w-2xl',
		extra
	]}
>
	<!-- the dialog's own box is all padding-free, so a click on it is a click beside this -->
	{#if open}{@render children()}{/if}
</dialog>

<style>
	@media (prefers-reduced-motion: no-preference) {
		dialog[open] {
			animation: dialog-enter 160ms ease-out;
		}

		@keyframes dialog-enter {
			from {
				scale: 0.94;
				opacity: 0;
			}
		}
	}
</style>
