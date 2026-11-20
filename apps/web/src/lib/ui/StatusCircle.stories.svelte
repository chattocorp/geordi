<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import StatusCircle from '@geordi/ui/StatusCircle.svelte';
	const { Story } = defineMeta({
		title: 'UI/Status circle',
		component: StatusCircle
	});
</script>

<Story name="Tones" asChild>
	<div class="flex gap-2 p-4">
		<StatusCircle tone="accent" label="Waiting for your answer">
			<span class="icon-[lucide--message-circle-question] size-4"></span>
		</StatusCircle>
		<StatusCircle tone="ok" label="Ready to merge">
			<span class="icon-[lucide--git-pull-request-arrow] size-4"></span>
		</StatusCircle>
		<StatusCircle tone="danger" label="Checks failed">
			<span class="icon-[lucide--circle-x] size-4"></span>
		</StatusCircle>
		<StatusCircle tone="merged" label="Merged">
			<span class="icon-[lucide--git-merge] size-4"></span>
		</StatusCircle>
		<StatusCircle label="No changes">
			<span class="icon-[lucide--circle-dashed] size-4"></span>
		</StatusCircle>
	</div>
</Story>
