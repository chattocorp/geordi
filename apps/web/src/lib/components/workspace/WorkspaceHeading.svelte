<script lang="ts">
	import { promptTitle } from '#lib/prompt-title.ts';

	let { title, prompt, columnWidth }: { title: string; prompt?: string; columnWidth?: number } =
		$props();

	const line = $derived(prompt?.split('\n', 1)[0].trim());
	const fromPrompt = $derived(line && promptTitle(line) === title);
	const heading = $derived(fromPrompt ? line : title);
</script>

<h1
	class="truncate heading"
	style:max-width={fromPrompt && columnWidth ? `${columnWidth}px` : undefined}
	title={heading}
>
	{heading}
</h1>
