<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ComponentProps } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { createAttachmentKey, type Attachment } from 'svelte/attachments';
	import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES } from '@geordi/protocol';
	import ImageAttachments from '#lib/ui/ImageAttachments.svelte';
	import Composer from '#lib/ui/Composer.svelte';
	import Button from '#lib/ui/Button.svelte';

	let {
		form,
		imageField,
		footer,
		disabled = false,
		...props
	}: Omit<ComponentProps<typeof Composer>, 'attachments' | 'onpaste'> & {
		imageField: HTMLInputAttributes;
	} = $props();
	const imageKey = createAttachmentKey();

	let images = $state<string[]>([]);
	let uploading = $state(false);
	let imageProblem = $state('');
	let picker = $state<HTMLInputElement>();

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
		const reset = () => {
			images = [];
			imageProblem = '';
		};
		const submit = (event: SubmitEvent) => {
			if (uploading || disabled) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		};
		node.addEventListener('submit', submit, true);
		node.addEventListener('reset', reset);
		return () => {
			node.removeEventListener('submit', submit, true);
			node.removeEventListener('reset', reset);
		};
	};
</script>

<Composer
	{...props}
	form={{ ...form, [imageKey]: manageImages }}
	disabled={disabled || uploading}
	onpaste={paste}
>
	{#snippet attachments()}
		<input {...imageField} type="hidden" value={JSON.stringify(images)} />
		<input
			bind:this={picker}
			type="file"
			accept={IMAGE_TYPES.join(',')}
			multiple
			class="hidden"
			aria-label="Choose images"
			onchange={() => {
				void addImages([...(picker?.files ?? [])]);
				if (picker) picker.value = '';
			}}
		/>
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
	{#snippet footer()}
		<Button
			type="button"
			variant="ghost"
			icon="icon-[lucide--image-plus]"
			label="Add images"
			disabled={images.length >= MAX_IMAGES}
			onclick={() => picker?.click()}
		/>
		{@render footer()}
	{/snippet}
</Composer>
