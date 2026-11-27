<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import Split from './Split.svelte';

	const { Story } = defineMeta({ title: 'UI/Split', component: Split });
</script>

<script lang="ts">
	let closed = $state(false);
	let folded = $state<'a' | 'b' | null>(null);
	let across = $state(0.6);
	let saved = $state(0.15);
	let down = $state(0.5);
</script>

{#snippet pane(text: string)}
	<div class="grid h-full place-items-center bg-sunken text-sm text-muted">{text}</div>
{/snippet}

<Story name="Side by side" asChild>
	<div class="flex h-48 card">
		<Split dir="row" bind:ratio={across}>
			{#snippet a()}{@render pane('A')}{/snippet}
			{#snippet b()}{@render pane('B')}{/snippet}
		</Split>
	</div>
</Story>

<Story name="One above the other" asChild>
	<div class="flex h-48 card">
		<Split dir="column" bind:ratio={down}>
			{#snippet a()}{@render pane('A')}{/snippet}
			{#snippet b()}{@render pane('B')}{/snippet}
		</Split>
	</div>
</Story>

<!-- For sheets, whose shapes part them: the gap between them is what is dragged. -->
<Story
	name="Without a line"
	asChild
	play={async ({ canvas, userEvent }) => {
		const divider = canvas.getByRole('separator');
		const background = getComputedStyle(divider).backgroundColor;
		await userEvent.hover(divider);
		await expect(getComputedStyle(divider).backgroundColor).toBe(background);
	}}
>
	<div class="flex h-48 rounded-card bg-frame p-2">
		<Split dir="row" bind:ratio={across} bare>
			{#snippet a()}<div class="mr-1 flex flex-1 sheet">{@render pane('A')}</div>{/snippet}
			{#snippet b()}<div class="ml-1 flex flex-1 sheet-quiet">{@render pane('B')}</div>{/snippet}
		</Split>
	</div>
</Story>

<Story name="Toggle sidebar" asChild>
	<button class="quiet-action" onclick={() => (closed = !closed)}>Toggle sidebar</button>
	<div class="flex h-48 card">
		<Split dir="row" ratio={0.6} collapsed={closed} min={[120, 120]}>
			{#snippet a()}{@render pane('Conversation')}{/snippet}
			{#snippet b()}{@render pane('Changes')}{/snippet}
		</Split>
	</div>
</Story>

<Story
	name="Collapsed"
	asChild
	play={async ({ canvas }) => {
		await expect(canvas.getByText('B')).not.toBeVisible();
	}}
>
	<div class="flex h-48 card">
		<Split dir="row" ratio={0.6} collapsed>
			{#snippet a()}{@render pane('A has all the room')}{/snippet}
			{#snippet b()}{@render pane('B')}{/snippet}
		</Split>
	</div>
</Story>

<Story name="Conversation beside tools" asChild>
	<div class="flex h-48 card">
		<Split dir="row" bind:ratio={saved} minRatio={0.5} bare>
			{#snippet a()}{@render pane('Conversation')}{/snippet}
			{#snippet b()}{@render pane('Changes')}{/snippet}
		</Split>
	</div>
</Story>

<!-- A folded side keeps only what it needs of itself, such as a sheet's tab row. -->
<Story
	name="Folded"
	asChild
	play={async ({ canvas }) => {
		await expect(canvas.getByText('Folded to its bar').getBoundingClientRect().height).toBeLessThan(
			48
		);
	}}
>
	<div class="flex h-48 card">
		<Split dir="column" ratio={0.5} fold="a">
			{#snippet a()}<div class="pane-bar px-2 text-sm">Folded to its bar</div>{/snippet}
			{#snippet b()}{@render pane('B has the rest')}{/snippet}
		</Split>
	</div>
</Story>

<Story
	name="Fold and unfold the panels"
	asChild
	play={async ({ canvas, userEvent }) => {
		for (const name of ['Changes', 'Terminal']) {
			const button = canvas.getByRole('button', { name });
			const panel = button.parentElement!;
			const height = () => panel.getBoundingClientRect().height;
			const open = height();
			await userEvent.click(button);
			await waitFor(() => expect(height()).toBe(button.getBoundingClientRect().height));
			await userEvent.click(button);
			await waitFor(() => expect(height()).toBe(open));
		}
	}}
>
	<div class="flex h-80 card">
		<Split dir="column" ratio={0.4} fold={folded} min={[120, 120]}>
			{#snippet a()}
				<button class="pane-bar px-2" onclick={() => (folded = folded === 'a' ? null : 'a')}>
					Changes
				</button>
			{/snippet}
			{#snippet b()}
				<button class="pane-bar px-2" onclick={() => (folded = folded === 'b' ? null : 'b')}>
					Terminal
				</button>
			{/snippet}
		</Split>
	</div>
</Story>
