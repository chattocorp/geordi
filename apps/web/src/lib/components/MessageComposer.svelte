<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ComponentProps } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { createAttachmentKey, type Attachment } from 'svelte/attachments';
	import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES } from '@geordi/protocol';
	import ImageAttachments from '#lib/ui/ImageAttachments.svelte';
	import Composer from '#lib/ui/Composer.svelte';

	let {
		form,
		imageField,
		suggestion,
		disabled = false,
		images = $bindable([]),
		...props
	}: Omit<ComponentProps<typeof Composer>, 'attachments' | 'onpaste'> & {
		imageField: HTMLInputAttributes;
		/** The images attached, by ID: bind it to keep them (a draft). */
		images?: string[];
	} = $props();
	const imageKey = createAttachmentKey();

	let uploading = $state(false);
	let dropping = $state(false);
	let imageProblem = $state('');
	let text: HTMLTextAreaElement | null = null;

	async function addImages(files: File[]) {
		if (disabled || uploading || !files.length) return;
		imageProblem = '';
		if (images.length + files.length > MAX_IMAGES) {
			imageProblem = `Add up to ${MAX_IMAGES} images per message`;
			return;
		}
		if (
			files.some(
				(file) =>
					!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number]) ||
					!file.size ||
					file.size > MAX_IMAGE_BYTES
			)
		) {
			imageProblem = 'Choose PNG, JPEG, WebP or GIF images, at most 5 MB each';
			return;
		}
		uploading = true;
		try {
			for (const file of files) {
				const response = await fetch(resolve('/images'), { method: 'POST', body: file });
				if (!response.ok) throw new Error(`Could not add ${file.name}. Try again.`);
				const { id } = (await response.json()) as { id: string };
				images = [...images, id];
			}
		} catch (cause) {
			imageProblem = cause instanceof Error ? cause.message : 'Could not add the image. Try again.';
		} finally {
			uploading = false;
		}
	}

	function paste(event: ClipboardEvent) {
		if (disabled || uploading) return;
		const files = [...(event.clipboardData?.items ?? [])]
			.filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
			.flatMap((item) => item.getAsFile() ?? []);
		if (!files.length) return; // ordinary text pastes keep their normal behavior
		event.preventDefault();
		void addImages(files);
	}

	const manageImages: Attachment<HTMLFormElement> = (node) => {
		text = node.querySelector('textarea');
		const reset = () => {
			images = [];
			imageProblem = '';
		};
		// (the text stays open while images upload: sending waits for them instead)
		const submit = (event: SubmitEvent) => {
			if (uploading || disabled) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		};
		// images dropped anywhere on the composer are attached, like pasted ones
		let depth = 0; // (entering a child leaves its parent: count, so the hint doesn't flicker)
		const carriesFiles = (event: DragEvent) =>
			!disabled && !uploading && !!event.dataTransfer?.types.includes('Files');
		const enter = (event: DragEvent) => {
			if (!carriesFiles(event)) return;
			depth++;
			dropping = true;
		};
		const over = (event: DragEvent) => {
			if (!carriesFiles(event)) return;
			event.preventDefault(); // (or the browser opens the file instead)
			event.dataTransfer!.dropEffect = 'copy';
		};
		const leave = (event: DragEvent) => {
			if (!carriesFiles(event)) return;
			depth = Math.max(0, depth - 1);
			dropping = depth > 0;
		};
		const drop = (event: DragEvent) => {
			depth = 0;
			dropping = false;
			const files = [...(event.dataTransfer?.files ?? [])];
			if (!files.length) return; // dropped text goes into the text as usual
			event.preventDefault();
			void addImages(files);
			text?.focus();
		};
		node.addEventListener('submit', submit, true);
		node.addEventListener('reset', reset);
		node.addEventListener('dragenter', enter);
		node.addEventListener('dragover', over);
		node.addEventListener('dragleave', leave);
		node.addEventListener('drop', drop);
		return () => {
			node.removeEventListener('submit', submit, true);
			node.removeEventListener('reset', reset);
			node.removeEventListener('dragenter', enter);
			node.removeEventListener('dragover', over);
			node.removeEventListener('dragleave', leave);
			node.removeEventListener('drop', drop);
		};
	};
</script>

<Composer
	{...props}
	suggestion={uploading || images.length ? null : suggestion}
	form={{ ...form, 'data-dropping': dropping || undefined, [imageKey]: manageImages }}
	{disabled}
	onpaste={paste}
>
	{#snippet attachments()}
		<input {...imageField} type="hidden" value={JSON.stringify(images)} />
		<ImageAttachments
			images={images.map((id, index) => ({
				id,
				src: resolve('/images/[id]', { id }),
				alt: `Attached image ${index + 1}`
			}))}
			onremove={(id) => (images = images.filter((image) => image !== id))}
		/>

		{#if uploading}<p class="px-4 text-sm text-muted" role="status">Adding images…</p>{/if}
		{#if imageProblem}<p class="px-4 text-sm text-danger" role="alert">{imageProblem}</p>{/if}
	{/snippet}
</Composer>
