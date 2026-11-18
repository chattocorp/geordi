<script module lang="ts">
	import { expect, fireEvent, userEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { WorkspaceStanding } from '#lib/actions.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import Sidebar from './Sidebar.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Sidebar', component: Sidebar });

	type Item = Navigation['workspaces'][number];

	const ready: WorkspaceStanding = {
		label: 'Ready to merge',
		tone: 'ok',
		icon: 'icon-[lucide--circle-check]'
	};
	const failing: WorkspaceStanding = {
		label: 'Checks failing',
		tone: 'danger',
		icon: 'icon-[lucide--circle-x]'
	};
	const merged: WorkspaceStanding = {
		label: 'Merged',
		tone: 'merged',
		icon: 'icon-[lucide--git-merge]'
	};

	const workspace = (id: string, title: string, rest: Partial<Item> = {}): Item => ({
		id,
		title,
		repoId: 'geordi',
		parentId: null,
		status: 'idle',
		working: false,
		hidden: false,
		outcome: 'completed',
		standing: null,
		actions: [],
		branch: `geordi/${id}`,
		pull: null,
		updatedAt: '2026-11-18T12:00:00.000Z',
		...rest
	});

	const repo = (id: string, name: string, workspaceCount: number) => ({
		id,
		name,
		path: `/code/${id}`,
		registeredAt: '2026-11-14T09:00:00.000Z',
		workspaceCount,
		working: 0
	});

	/** One of each state a row can be in: what is at work, what waits, how the work stands. */
	const nav: Navigation = {
		repos: [
			repo('geordi', 'geordi', 6),
			repo('sample', 'sample-project', 2),
			repo('idle', 'no-workspaces', 0)
		],
		workspaces: [
			workspace('asking', 'Choose a storage engine', { outcome: 'asking' }),
			workspace('working', 'Scale live views and the event log', {
				status: 'running',
				working: true,
				outcome: null
			}),
			workspace('aide', 'Review the daemon', {
				parentId: 'working',
				status: 'running',
				working: true,
				outcome: null
			}),
			workspace('ready', 'Raise light mode text contrast', { standing: ready }),
			workspace('failing', 'Guard shared worktrees from update and continue', {
				standing: failing
			}),
			workspace('merged', 'Run checks, lint and tests in CI', { standing: merged }),
			workspace('plain', 'Try out the new parser', { repoId: 'sample' }),
			workspace(
				'long',
				'A title that is far too long to fit into the sidebar at any sensible width',
				{
					repoId: 'sample',
					standing: ready
				}
			)
		],
		harnesses: null
	};

	/** Some put out of sight: one with what its agent started, one whose agent asks. */
	const withHidden: Navigation = {
		...nav,
		workspaces: [
			...nav.workspaces,
			workspace('old', 'Sketch the onboarding flow', { hidden: true }),
			workspace('old-aide', 'Draft onboarding copy', { parentId: 'old' }),
			workspace('waits', 'Pick a licence', { hidden: true, outcome: 'asking' })
		]
	};
</script>

{#snippet frame(nav: Navigation | undefined, path: string, lost = false)}
	<!-- as the layout holds it: in the frame, as tall as the window -->
	<div class="flex h-dvh w-64 bg-frame p-2">
		<Sidebar {nav} {path} {lost} />
	</div>
{/snippet}

<Story
	name="Workspaces"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('link', { name: /Raise light mode/ })).toHaveAttribute(
			'aria-current',
			'page'
		);
		// a repository without workspaces has no place here
		await expect(canvas.queryByText('no-workspaces')).toBeNull();
		await expect(canvas.queryByText('Reconnecting')).toBeNull();
	}}
>
	{@render frame(nav, '/workspaces/ready')}
</Story>

<Story name="On the overview" asChild>
	{@render frame(nav, '/overview')}
</Story>

<Story
	name="Nothing yet"
	asChild
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole('link', { name: 'New workspace' })).toBeVisible();
	}}
>
	{@render frame(undefined, '/')}
</Story>

<Story
	name="Hidden workspaces"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// even the one open goes with the hidden, and what its agent started with it; one
		// that asks something stays in sight
		await expect(canvas.queryByText('Sketch the onboarding flow')).toBeNull();
		await expect(canvas.queryByText('Draft onboarding copy')).toBeNull();
		await expect(canvas.getByText('Pick a licence')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Show 2 hidden' }));
		await expect(canvas.getByText('Sketch the onboarding flow')).toBeVisible();
		await expect(canvas.getByRole('button', { name: 'Show fewer' })).toBeVisible();
	}}
>
	{@render frame(withHidden, '/workspaces/old')}
</Story>

<Story name="Reconnecting with workspaces" asChild>
	{@render frame(nav, '/workspaces/ready', true)}
</Story>

<Story name="Waiting for navigation" asChild>
	{@render frame(undefined, '/', true)}
</Story>

<Story
	name="Reorder within a repository"
	asChild
	play={async ({ canvasElement }) => {
		const [sourceList, otherList] = within(canvasElement).getAllByRole('list');
		const sourceRows = within(sourceList).getAllByRole('listitem');
		const first = sourceRows[0];
		const last = sourceRows[sourceRows.length - 1];
		const overLast = () =>
			fireEvent.dragOver(last, { clientY: last.getBoundingClientRect().bottom - 1 });
		const markers = () => canvasElement.querySelectorAll('.row-drop-after, .row-drop-before');

		await fireEvent.dragStart(first);
		await overLast();
		await expect(markers()).toHaveLength(1);
		await expect(last).toHaveClass('row-drop-after');

		await fireEvent.dragLeave(sourceList, { relatedTarget: otherList });
		await expect(markers()).toHaveLength(0);
		await fireEvent.dragOver(within(otherList).getAllByRole('listitem')[0]);
		await expect(markers()).toHaveLength(0);

		await overLast();
		await expect(last).toHaveClass('row-drop-after');
		await fireEvent.dragEnd(first);
		await expect(markers()).toHaveLength(0);
	}}
>
	{@render frame(nav, '/workspaces/ready')}
</Story>
