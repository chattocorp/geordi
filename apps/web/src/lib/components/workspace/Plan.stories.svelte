<script module lang="ts">
	import { expect, fireEvent, waitFor, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { Navigation } from '#lib/server/views.ts';
	import Plan from './Plan.svelte';

	const { Story } = defineMeta({ title: 'Workspace/Plan', component: Plan });

	type Workspace = Navigation['workspaces'][number];
	const workspace = (id: string, title: string, rest: Partial<Workspace> = {}): Workspace => ({
		id,
		title,
		repoId: 'geordi',
		parentId: null,
		status: 'idle',
		working: false,
		outcome: 'completed',
		standing: null,
		actions: [],
		branch: `geordi/${id}`,
		pull: null,
		updatedAt: '2026-11-27T12:00:00.000Z',
		...rest
	});
	const item = (
		id: string,
		text: string,
		parentId: string | null,
		{ done = false, attached = false, note = '' } = {}
	) => ({
		id,
		parentId,
		text,
		note,
		done,
		workspace: attached,
		todo: !attached && parentId !== null
	});

	const base: Navigation = {
		repos: [
			{
				id: 'geordi',
				name: 'geordi',
				path: '/code/geordi',
				registeredAt: '2026-11-14T09:00:00.000Z',
				workspaceCount: 2,
				working: 1
			}
		],
		workspaces: [
			workspace('lead', 'Release 0.9'),
			workspace('child', 'Bump the protocol', {
				parentId: 'lead',
				status: 'running',
				working: true,
				outcome: null
			})
		],
		access: [],
		preferences: { identifyClaude: false },
		activeAgents: [],
		harnesses: null,
		items: []
	};

	/** A lead's plan: steps, one done, one with details, and one handed to a child agent. */
	const nav: Navigation = {
		...base,
		items: [
			item('lead', 'Release 0.9', null, { attached: true }),
			item('notes', 'Write the release notes', 'lead', { done: true }),
			item('try', 'Try it in the dev app', 'lead', {
				note: 'Start a turn, restart the forge and the daemon during it, and see that it goes on.'
			}),
			item('restart', 'With a forge restart', 'try'),
			item('child', 'Bump the protocol', 'lead', { attached: true }),
			item('childs-own', 'Its own step', 'child'),
			item('elsewhere', 'Not in this plan', null)
		]
	};
</script>

<Story
	name="A lead's plan"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('textbox', { name: 'Try it in the dev app' })).toBeVisible();
		// a child agent is a row that leads to it; its own items are its own
		await expect(canvas.getByRole('link', { name: /Bump the protocol/ })).toBeVisible();
		await expect(canvas.queryByRole('textbox', { name: 'Its own step' })).toBeNull();
		await expect(canvas.queryByRole('textbox', { name: 'Not in this plan' })).toBeNull();
	}}
>
	<div class="h-96 w-80 sheet">
		<Plan workspaceId="lead" {nav} />
	</div>
</Story>

<Story
	name="Nothing planned yet"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText(/Write down what is to be done here/)).toBeVisible();
		await expect(canvas.getByRole('button', { name: 'New todo' })).toBeVisible();
	}}
>
	<div class="h-96 w-80 sheet">
		<Plan
			workspaceId="child"
			nav={{ ...nav, items: [item('child', 'x', null, { attached: true })] }}
		/>
	</div>
</Story>

<Story
	name="Zoomed into a step"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await fireEvent.keyDown(canvas.getByRole('textbox', { name: 'Try it in the dev app' }), {
			key: '.',
			code: 'Period',
			ctrlKey: true
		});
		await expect(
			await canvas.findByRole('heading', { name: 'Try it in the dev app' })
		).toBeVisible();
		await expect(canvas.getByRole('textbox', { name: 'With a forge restart' })).toBeVisible();
		await waitFor(() =>
			expect(canvas.queryByRole('link', { name: /Bump the protocol/ })).toBeNull()
		);
		// Cmd-Shift-. goes back up, to the plan
		await fireEvent.keyDown(canvas.getByRole('textbox', { name: 'With a forge restart' }), {
			key: '>',
			code: 'Period',
			ctrlKey: true,
			shiftKey: true
		});
		await waitFor(() =>
			expect(canvas.getByRole('link', { name: /Bump the protocol/ })).toBeVisible()
		);
	}}
>
	<div class="h-96 w-80 sheet">
		<Plan workspaceId="lead" {nav} />
	</div>
</Story>
