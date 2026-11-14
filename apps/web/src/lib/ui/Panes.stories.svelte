<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { move, singleGroup, groupsOf, type Layout } from '#lib/layout.ts';
	import Panes from './Panes.svelte';

	const { Story } = defineMeta({ title: 'UI/Panes', component: Panes });

	const start = singleGroup(['One', 'Two', 'Three']);
	const split = move(start, 'Three', groupsOf(start)[0].id, 'right');
</script>

<script lang="ts">
	let single = $state.raw<Layout>(start);
	let halves = $state.raw<Layout>(split);
	let nothing = $state.raw<Layout>(singleGroup([]));
	let count = 3;
</script>

{#snippet tab(id: string)}
	<span class="icon-[lucide--file] size-3.5 shrink-0"></span>
	<span class="truncate">{id}</span>
{/snippet}

{#snippet window(id: string)}
	<div class="grid flex-1 place-items-center text-muted">{id}</div>
{/snippet}

<!-- Drag a tab onto another group, or towards an edge to split. Drag the dividers to resize. -->
<Story name="Tabs" asChild>
	<div class="flex h-80 overflow-hidden card">
		<Panes
			layout={single}
			onchange={(next) => (single = next)}
			{tab}
			{window}
			newTab={() => `Tab ${++count}`}
		/>
	</div>
</Story>

<Story name="Split" asChild>
	<div class="flex h-80 overflow-hidden card">
		<Panes
			layout={halves}
			onchange={(next) => (halves = next)}
			{tab}
			{window}
			newTab={() => `Tab ${++count}`}
		/>
	</div>
</Story>

<Story name="Empty" asChild>
	<div class="flex h-48 overflow-hidden card">
		<Panes
			layout={nothing}
			onchange={(next) => (nothing = next)}
			{tab}
			{window}
			newTab={() => `Tab ${++count}`}
			newLabel="New terminal"
		>
			{#snippet empty()}No terminal open. Start one with +.{/snippet}
		</Panes>
	</div>
</Story>
