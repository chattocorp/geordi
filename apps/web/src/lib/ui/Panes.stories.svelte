<script module lang="ts">
	import { expect, fireEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { move, singleGroup, groupsOf, type Layout } from '#lib/layout.ts';
	import Button from '@geordi/ui/Button.svelte';
	import Panes from './Panes.svelte';

	const { Story } = defineMeta({ title: 'UI/Panes', component: Panes });

	const start = singleGroup(['One', 'Two', 'Three']);
	const split = move(start, 'Three', groupsOf(start)[0].id, 'right');
</script>

<script lang="ts">
	let single = $state.raw<Layout>(singleGroup(['Conversation', 'WorkspaceView.svelte']));
	let halves = $state.raw<Layout>(split);
	let nothing = $state.raw<Layout>(singleGroup([]));
	let dock = $state.raw<Layout>(singleGroup(['Terminal 1', 'Run']));
	let started = $state(false);
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
<Story
	name="Tabs"
	asChild
	play={async ({ canvas, userEvent }) => {
		const file = canvas.getByRole('tab', { name: 'WorkspaceView.svelte' });
		await userEvent.click(file);
		await expect(file).toHaveAttribute('aria-selected', 'true');
		await expect(canvas.getByRole('tabpanel', { name: 'WorkspaceView.svelte' })).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'New window' }));
		const added = canvas.getByRole('tab', { name: /^Tab / });
		const conversation = canvas.getByRole('tab', { name: 'Conversation' });
		const dataTransfer = new DataTransfer();
		await fireEvent.dragStart(added, { dataTransfer });
		await fireEvent.dragOver(conversation, {
			dataTransfer,
			clientX: conversation.getBoundingClientRect().left
		});
		await fireEvent.drop(conversation, { dataTransfer });
		await expect(canvas.getAllByRole('tab')[0]).toHaveTextContent(added.textContent!.trim());
		await userEvent.click(
			within(added.closest('[draggable]') as HTMLElement).getByRole('button', { name: 'Close' })
		);
		await expect(conversation).toHaveAttribute('aria-selected', 'true');
	}}
>
	<div class="flex h-80 sheet overflow-hidden">
		<Panes
			layout={single}
			onchange={(next) => (single = next)}
			closable={(id) => id !== 'Conversation'}
			{window}
			newTab={() => `Tab ${++count}`}
		>
			{#snippet tab(id: string)}
				{#if id === 'Conversation'}
					<span class="icon-[lucide--code-xml] size-3.5 shrink-0 text-codex"></span>
					{id}
				{:else}
					<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
					<span class="truncate code-dense">{id}</span>
				{/if}
			{/snippet}
		</Panes>
	</div>
</Story>

{#snippet run()}
	<Button
		variant="ghost"
		size="sm"
		icon={started ? 'icon-[lucide--circle-stop]' : 'icon-[lucide--play]'}
		label={started ? 'Stop the project' : 'Run the project'}
		onclick={() => (started = !started)}
		class={[started && 'hover:text-danger!']}
	/>
{/snippet}

<!-- A tab with a control of its own, beside its label: the Run tab's button. -->
<Story
	name="Tab control"
	asChild
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Run the project' }));
		await expect(canvas.getByRole('button', { name: 'Stop the project' })).toBeVisible();
		await expect(canvas.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
	}}
>
	<div class="flex h-48 sheet-quiet overflow-hidden">
		<Panes
			layout={dock}
			onchange={(next) => (dock = next)}
			{tab}
			{window}
			closable={(id) => id !== 'Run'}
			control={(id) => (id === 'Run' ? run : undefined)}
		></Panes>
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
