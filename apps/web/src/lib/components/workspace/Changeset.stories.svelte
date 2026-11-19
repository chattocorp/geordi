<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ReleasePlan } from '@geordi/protocol';
	import { expect, fn, userEvent } from 'storybook/test';
	import Changeset from './Changeset.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Changeset', component: Changeset });

	const plan: ReleasePlan = {
		tool: 'sweet-release',
		name: 'Sweet Release',
		problem: null,
		ask: null,
		packages: [
			{
				path: 'apps/api',
				name: 'API',
				version: '1.2.3',
				bump: 'minor',
				nextVersion: '1.3.0',
				problems: [],
				notes: [
					{
						path: 'apps/api/.sweet/jade-early-willow.md',
						type: 'feature',
						breaking: false,
						body: 'Configured clients can register plain-HTTP redirect URIs on loopback hosts (`localhost`, `*.localhost`, `127.0.0.0/8`, and `[::1]`), such as `http://localhost:5173/auth/callback`, on any issuer. Before, these were accepted only when the public URL was a loopback address.\n\nRedirect URI matching stays exact, including the port.',
						added: true
					},
					{
						path: 'apps/api/.sweet/red-bold-otter.md',
						type: 'change',
						breaking: true,
						body: 'Access tokens last five minutes. Clients must refresh them.',
						added: true
					},
					{
						path: 'apps/api/.sweet/blue-calm-river.md',
						type: 'fix',
						breaking: false,
						body: 'Keep changelog source attribution inline after the final paragraph.',
						added: false
					}
				]
			},
			{
				path: 'apps/web',
				name: null,
				version: '0.9.0',
				bump: 'major',
				nextVersion: '1.0.0',
				problems: [],
				notes: [
					{
						path: 'apps/web/.sweet/quiet-early-dawn.md',
						type: 'feature',
						breaking: true,
						body: 'Drop the old login page.',
						added: false
					}
				]
			}
		]
	};
	const onsave = fn(async () => {});
	const onopen = () => {};
</script>

{#snippet pane(plan: ReleasePlan)}
	<div class="flex h-128 w-full max-w-2xl flex-col overflow-hidden card">
		<Changeset {plan} {onopen} onallow={onopen} {onsave} />
	</div>
{/snippet}

<Story name="Notes of this workspace" asChild>{@render pane(plan)}</Story>

<Story name="No notes yet" asChild>
	{@render pane({
		...plan,
		packages: plan.packages.map((pkg) => ({ ...pkg, notes: [], nextVersion: null }))
	})}
</Story>

<Story name="The tool is not there" asChild>
	{@render pane({ ...plan, packages: [], problem: 'sweet is not installed on this machine' })}
</Story>

<Story name="Not allowed to ask yet" asChild>
	{@render pane({ ...plan, packages: [], ask: 'sweet status --json' })}
</Story>

<Story
	name="Edit a note"
	asChild
	play={async ({ canvas }) => {
		const note = plan.packages[0].notes[1];
		const edit = canvas.getByRole('button', { name: 'Edit red-bold-otter.md' });
		await userEvent.click(edit);
		const field = canvas.getByRole('textbox', { name: 'Change note text' });
		await expect(field).toHaveValue(note.body);
		await userEvent.clear(field);
		await expect(canvas.getByRole('button', { name: 'Save' })).toBeDisabled();
		await userEvent.type(field, 'Refresh access tokens every five minutes.');
		await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
		await expect(onsave).toHaveBeenCalledWith(
			note.path,
			note.body,
			'Refresh access tokens every five minutes.'
		);
	}}
>
	{@render pane(plan)}
</Story>
