<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import LinkCard from '@geordi/ui/LinkCard.svelte';
	const { Story } = defineMeta({ title: 'UI/Link card', component: LinkCard });
</script>

<Story
	name="With a separate action"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const action = canvas.getByRole('button', { name: 'Start workspace' });
		const bounds = action.getBoundingClientRect();
		await expect(
			action.contains(
				canvasElement.ownerDocument.elementFromPoint(
					bounds.x + bounds.width / 2,
					bounds.y + bounds.height / 2
				)
			)
		).toBe(true);
	}}
>
	<div class="max-w-sm p-3">
		<LinkCard
			title="Keep the last terminal row visible"
			href="https://example.org/issues/42"
			external
		>
			{#snippet header()}<span class="icon-[lucide--circle-dot] size-4 text-ok"></span>#42{/snippet}
			{#snippet footer()}<span>@alex</span><button type="button" class="ml-auto item px-2 py-1">
					Start workspace
				</button>{/snippet}
		</LinkCard>
	</div>
</Story>
