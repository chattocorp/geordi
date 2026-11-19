<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor } from 'storybook/test';
	import Tooltip from './Tooltip.svelte';

	const { Story } = defineMeta({ title: 'UI/Tooltip', component: Tooltip });
</script>

<Story
	name="On hover and focus"
	asChild
	play={async ({ canvas }) => {
		const tip = canvas.getByRole('tooltip', { hidden: true });
		await expect(tip).not.toBeVisible();
		await userEvent.tab();
		await waitFor(() => expect(tip).toBeVisible());
	}}
>
	<div class="pt-16 text-xs text-muted">
		<Tooltip>
			2m 14s
			{#snippet tip()}
				<p>150k tokens</p>
				<p class="text-muted">8 input · 353 output · 120,465 cache read</p>
			{/snippet}
		</Tooltip>
	</div>
</Story>
