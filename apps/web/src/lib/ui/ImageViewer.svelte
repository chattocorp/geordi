<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	type Props = {
		src: string;
		alt: string;
		/** Escape, or a click anywhere, asks for it. */
		onclose: () => void;
	};
	let { src, alt, onclose }: Props = $props();

	const modal: Attachment<HTMLDialogElement> = (dialog) => {
		dialog.showModal();
		return () => dialog.close();
	};
</script>

<!--
	A picture at the size of the window, over the page, for as long as it is there. It is a
	plain image: its right-click menu is the browser's own (copy it, save it).
-->
<dialog
	{@attach modal}
	aria-label={alt || 'Picture'}
	{onclose}
	onclick={onclose}
	class="size-full max-h-none max-w-none cursor-zoom-out items-center justify-center bg-transparent p-10 outline-none backdrop:bg-bg/85 open:flex"
>
	<img {src} {alt} class="max-h-full max-w-full rounded-control object-contain shadow-soft" />
</dialog>
