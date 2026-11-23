<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import Button from './Button.svelte';

	/** A button under a composer's text: small, so that it doesn't outweigh what is written. */
	let props: Omit<ComponentProps<typeof Button>, 'size'> = $props();
</script>

<Button {...props} size="sm" />
