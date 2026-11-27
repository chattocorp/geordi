<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor } from 'storybook/test';
	import Button from '@geordi/ui/Button.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import type { Command } from '#lib/commands.ts';

	const { Story } = defineMeta({ title: 'UI/CommandPalette', component: CommandPalette });

	let open = $state(false);
	let done = $state('');
	const item = (
		group: string,
		label: string,
		icon: string,
		extra: Partial<Command> = {}
	): Command => ({ id: label, group, label, icon, run: () => (done = label), ...extra });
	const items: Command[] = [
		item('Conversations', 'Claude', 'icon-[lucide--message-square]'),
		item('Conversations', 'Review the parser', 'icon-[lucide--message-square]'),
		item('Conversations', 'New conversation', 'icon-[lucide--message-square-plus]'),
		item('Terminals', 'Terminal 1', 'icon-[lucide--square-terminal]'),
		item('Terminals', 'New terminal', 'icon-[lucide--square-plus]'),
		item('Tasks', 'Run default tasks', 'icon-[lucide--play]', { shortcut: 'runDefault' }),
		item('Tasks', 'Run web', 'icon-[lucide--play]'),
		item('Windows', 'Changes', 'icon-[lucide--file-diff]'),
		item('Windows', 'Hide right sidebar', 'icon-[lucide--panel-right-close]', {
			shortcut: 'toggleSide'
		}),
		item('Changed files', 'keys.ts', 'icon-[lucide--file-diff]', {
			keywords: 'packages/ui/src/keys.ts'
		})
	];
</script>

<Story
	name="Open"
	asChild
	play={async ({ canvas }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Open the palette' }));
		const search = canvas.getByRole('combobox');
		await waitFor(() => expect(search).toHaveFocus());
		await userEvent.type(search, 'rweb');
		await userEvent.keyboard('{Enter}');
		await waitFor(() => expect(canvas.getByText('Ran: Run web')).toBeVisible());
	}}
>
	<Button onclick={() => (open = true)}>Open the palette</Button>
	<p class="text-sm text-muted">Ran: {done}</p>
	<CommandPalette bind:open label="Go to or do in this workspace" {items} />
</Story>

<Story
	name="With pictures"
	asChild
	play={async ({ canvas }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Open the palette' }));
		// an item with a repository shows what the caller draws for it, in place of its icon
		await waitFor(() => expect(canvas.getAllByTestId('picture')).toHaveLength(1));
	}}
>
	<Button onclick={() => (open = true)}>Open the palette</Button>
	<CommandPalette
		bind:open
		label="Move this workspace under an item"
		items={[
			item('Move under', 'Release 0.9', 'icon-[lucide--circle]'),
			item('Move under', 'Soften the colours', 'icon-[lucide--git-branch]', {
				repo: { id: 'sample', name: 'sample-site' }
			})
		]}
	>
		{#snippet picture(repo)}
			<span
				data-testid="picture"
				class="grid size-4 shrink-0 place-items-center rounded-control tone-accent text-xs"
			>
				{repo.name[0]}
			</span>
		{/snippet}
	</CommandPalette>
</Story>
