<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Split from './Split.svelte';

	const { Story } = defineMeta({ title: 'UI/Split', component: Split });
</script>

<script lang="ts">
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
		await userEvent.hover(canvas.getByRole('separator'));
	}}
>
	<div class="flex h-48 rounded-card bg-frame p-2">
		<Split dir="row" bind:ratio={across} bare>
			{#snippet a()}<div class="mr-1 flex flex-1 sheet">{@render pane('A')}</div>{/snippet}
			{#snippet b()}<div class="ml-1 flex flex-1 sheet-quiet">{@render pane('B')}</div>{/snippet}
		</Split>
	</div>
</Story>

<Story name="Collapsed" asChild>
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
