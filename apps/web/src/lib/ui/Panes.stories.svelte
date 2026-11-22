<script module lang="ts">
	import { expect, fireEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { close, open, move, singleGroup, groupsOf, type Layout } from '#lib/layout.ts';
	import Button from '@geordi/ui/Button.svelte';
	import Panes from './Panes.svelte';

	const { Story } = defineMeta({ title: 'UI/Panes', component: Panes });

	const start = singleGroup(['One', 'Two', 'Three']);
	const split = move(start, 'Three', groupsOf(start)[0].id, 'right');
</script>

<script lang="ts">
	let single = $state.raw<Layout>(singleGroup(['Conversation', 'WorkspaceView.svelte']));
	let halves = $state.raw<Layout>(split);
	let crowded = $state.raw<Layout>(
		singleGroup(['pnpm dev', 'pnpm desktop:dev', 'pnpm test', 'pnpm check', 'zsh', 'pnpm lint'])
	);
	let nothing = $state.raw<Layout>(singleGroup([]));
	let main = $state.raw<Layout>(singleGroup(['Conversation']));
	let side = $state.raw<Layout>(singleGroup(['Changes', 'Files']));
	let files = $state.raw<Layout>(singleGroup(['Changes', 'notes.md']));
	let wrap = $state(false);
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

<!-- More tabs than fit: they scroll, and the + beside them stays clear of them. -->
<Story
	name="Many tabs"
	asChild
	play={async ({ canvas }) => {
		const bar = canvas.getByRole('tablist');
		await expect(bar.scrollWidth).toBeGreaterThan(bar.clientWidth);
		const plus = canvas.getByRole('button', { name: 'New window' }).getBoundingClientRect();
		await expect(bar.getBoundingClientRect().right).toBeLessThanOrEqual(plus.left);
	}}
>
	<div class="flex h-48 w-96 sheet overflow-hidden">
		<Panes
			layout={crowded}
			onchange={(next) => (crowded = next)}
			closable={() => true}
			{tab}
			{window}
			newTab={() => `Tab ${++count}`}
		/>
	</div>
</Story>

<!-- What comes before the tabs: in a workspace, the button that folds a sheet beside the conversation. -->
<Story name="With a lead" asChild>
	<div class="flex h-48 sheet-quiet overflow-hidden">
		<Panes layout={side} onchange={(next) => (side = next)} {tab} {window} splits={false}>
			{#snippet lead()}
				<Button variant="ghost" size="sm" icon="icon-[lucide--chevron-down]" label="Fold" />
			{/snippet}
		</Panes>
	</div>
</Story>

<!-- What can be done with the window shown: here, wrapping a file's long lines. -->
<Story
	name="With window tools"
	asChild
	play={async ({ canvas, userEvent }) => {
		await expect(canvas.queryByRole('button', { name: 'Wrap lines' })).toBeNull();
		await userEvent.click(canvas.getByRole('tab', { name: 'notes.md' }));
		await userEvent.click(canvas.getByRole('button', { name: 'Wrap lines', pressed: false }));
		await expect(canvas.getByRole('button', { name: 'Wrap lines', pressed: true })).toBeVisible();
	}}
>
	<div class="flex h-48 sheet-quiet overflow-hidden">
		<Panes layout={files} onchange={(next) => (files = next)} {tab} {window} splits={false}>
			{#snippet tools(id: string)}
				{#if id.endsWith('.md')}
					<Button
						variant="tool"
						size="sm"
						icon="icon-[lucide--wrap-text]"
						label="Wrap lines"
						aria-pressed={wrap}
						onclick={() => (wrap = !wrap)}
					/>
				{/if}
			{/snippet}
		</Panes>
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
			newIcon="icon-[lucide--square-terminal]"
		>
			{#snippet empty()}No terminal open. Start one from the bar.{/snippet}
		</Panes>
	</div>
</Story>

<Story
	name="Promote a tab"
	asChild
	play={async ({ canvas, userEvent }) => {
		const [mainBar, sideBar] = canvas.getAllByRole('tablist').map((bar) => within(bar));
		const files = sideBar.getByRole('tab', { name: 'Files' });
		await userEvent.click(files);
		await expect(files).toHaveAttribute('aria-selected', 'true');
		await userEvent.dblClick(files);
		await expect(mainBar.getByRole('tab', { name: 'Files' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(sideBar.getByRole('tab', { name: 'Changes' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
	}}
>
	<div class="flex h-80 gap-2">
		<Panes layout={main} onchange={(next) => (main = next)} {tab} {window} />
		<Panes
			layout={side}
			onchange={(next) => (side = next)}
			{tab}
			{window}
			ondoubleclick={(id) => {
				main = open(main, id);
				side = close(side, id);
			}}
		/>
	</div>
</Story>
