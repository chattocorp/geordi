<script lang="ts">
	import { onDestroy } from 'svelte';
	import Button from '#lib/ui/Button.svelte';

	let { text }: { text: string } = $props();
	let status = $state<'idle' | 'copied' | 'failed'>('idle');
	let reset: ReturnType<typeof setTimeout>;
	onDestroy(() => clearTimeout(reset));

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			status = 'copied';
		} catch {
			status = 'failed';
		}
		clearTimeout(reset);
		reset = setTimeout(() => (status = 'idle'), 1500);
	}
</script>

<Button
	variant="ghost"
	size="sm"
	icon={status === 'copied'
		? 'icon-[lucide--check]'
		: status === 'failed'
			? 'icon-[lucide--triangle-alert]'
			: 'icon-[lucide--copy]'}
	label={status === 'copied'
		? 'Copied'
		: status === 'failed'
			? 'Copy failed. Try again'
			: 'Copy message'}
	onclick={copy}
/>
