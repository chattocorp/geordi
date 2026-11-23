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

<!-- in a sheet that clips what overflows it, by its right edge: the tip is neither cut off nor off-screen -->
<Story
	name="By the edge of a clipping sheet"
	asChild
	play={async ({ canvas }) => {
		const tip = canvas.getByRole('tooltip', { hidden: true });
		await userEvent.tab();
		await waitFor(() => expect(tip).toBeVisible());
		const { right } = tip.getBoundingClientRect();
		await expect(right).toBeLessThanOrEqual(document.documentElement.clientWidth);
	}}
>
	<div class="flex justify-end">
		<div class="mt-20 flex w-48 justify-end sheet overflow-hidden p-2 text-xs text-muted">
			<Tooltip>
				Context
				{#snippet tip()}
					<p>A tip far wider than the sheet it is shown from</p>
				{/snippet}
			</Tooltip>
		</div>
	</div>
</Story>
