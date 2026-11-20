<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import SourceView from './SourceView.svelte';
	const { Story } = defineMeta({ title: 'Geordi/Source file', component: SourceView });
	const text = Array.from({ length: 200 }, (_, i) => `Source line ${i + 1}`).join('\n');
</script>

<Story
	name="Cited line"
	asChild
	play={async ({ canvas, canvasElement }) => {
		const line = canvas.getByLabelText('Line 139');
		const pane = canvasElement.querySelector('.scroller')!;
		await waitFor(() => {
			expect(line).toHaveTextContent('Source line 139');
			expect(line.getBoundingClientRect().top).toBeGreaterThanOrEqual(
				pane.getBoundingClientRect().top
			);
			expect(line.getBoundingClientRect().bottom).toBeLessThanOrEqual(
				pane.getBoundingClientRect().bottom
			);
		});
	}}
>
	<div class="flex h-80 flex-col sheet"><SourceView path="notes.txt" {text} line={139} /></div>
</Story>
