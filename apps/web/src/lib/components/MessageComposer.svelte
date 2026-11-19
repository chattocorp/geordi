<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import WithMessageImages from './WithMessageImages.svelte';
	import Composer from '@geordi/ui/Composer.svelte';

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
</script>

<WithMessageImages {form} {imageField} bind:images {disabled}>
	{#snippet children(imageProps, hasImages)}
		<Composer {...props} {...imageProps} {disabled} suggestion={hasImages ? null : suggestion} />
	{/snippet}
</WithMessageImages>
