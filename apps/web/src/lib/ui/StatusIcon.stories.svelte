<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import StatusIcon from '@geordi/ui/StatusIcon.svelte';
	const { Story } = defineMeta({
		title: 'UI/Status icon',
		component: StatusIcon
	});
</script>

<Story
	name="Passive tones"
	asChild
	play={async ({ canvasElement }) => {
		for (const icon of within(canvasElement).getAllByRole('img')) {
			await expect(icon).toHaveStyle({ backgroundColor: 'rgba(0, 0, 0, 0)' });
		}
	}}
>
	<div class="flex gap-2 p-4">
		<StatusIcon tone="accent" label="Waiting for your answer">
			<span class="icon-[lucide--message-circle-question] size-4"></span>
		</StatusIcon>
		<StatusIcon tone="ok" label="Ready to merge">
			<span class="icon-[lucide--git-pull-request-arrow] size-4"></span>
		</StatusIcon>
		<StatusIcon tone="danger" label="Checks failed">
			<span class="icon-[lucide--circle-x] size-4"></span>
		</StatusIcon>
		<StatusIcon tone="merged" label="Merged">
			<span class="icon-[lucide--git-merge] size-4"></span>
		</StatusIcon>
		<StatusIcon label="No changes">
			<span class="icon-[lucide--circle-dashed] size-4"></span>
		</StatusIcon>
	</div>
</Story>
