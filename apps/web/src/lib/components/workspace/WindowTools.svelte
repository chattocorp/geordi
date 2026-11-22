<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import type { FileTools } from './window-tools.svelte.ts';

	/** The tools of the files a window shows, and whether long lines wrap (in all of them). */
	let { tools, wrap }: { tools: FileTools[]; wrap: { current: boolean } } = $props();

	// how one file is shown; where there are several (the combined diff), each as it comes
	const modes = $derived(tools.length === 1 ? tools[0].modes : undefined);
	// Read as maybe gone even inside `{#if modes}`: its buttons are updated once more as it goes.
</script>

{#if modes}
	<div role="radiogroup" aria-label="Show the file" class="flex gap-1">
		{#each modes?.options ?? [] as option (option.value)}
			<Button
				variant="tool"
				size="sm"
				role="radio"
				aria-checked={modes?.current === option.value}
				icon={option.icon}
				label={option.label}
				onclick={() => modes?.select(option.value)}
			/>
		{/each}
	</div>
{/if}
{#if tools.some((file) => file.wrappable)}
	<Button
		variant="tool"
		size="sm"
		icon="icon-[lucide--wrap-text]"
		label="Wrap lines"
		aria-pressed={wrap.current}
		onclick={() => (wrap.current = !wrap.current)}
	/>
{/if}
