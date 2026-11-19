<script module lang="ts">
	import { expect, fireEvent, waitFor, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { WorkspaceStanding } from '@geordi/ui/actions';
	import type { Navigation } from '#lib/server/views.ts';
	import Sidebar from './Sidebar.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Sidebar', component: Sidebar });

	type Item = Navigation['workspaces'][number];

	/** What is folded away: in the app, remembered in the browser. */
	const folded = $state({ current: [] as string[] });
	/** The repository shown alone: in the app, remembered in the browser too. */
	const focus = $state({ current: null as string | null });

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
			repo('geordi', 'geordi', 8),
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
			workspace('ready', 'Raise light mode text contrast', {
				standing: ready,
				actions: [{ id: 'merge-pull', label: 'Merge PR', icon: 'icon-[lucide--git-merge]' }]
			}),
			workspace('tokens', 'Check every token in dark mode', { parentId: 'ready' }),
			workspace('failing', 'Guard shared worktrees from update and continue', {
				standing: failing,
				actions: [{ id: 'fix-checks', label: 'Fix errors', icon: 'icon-[lucide--wrench]' }]
			}),
			workspace('conflict', 'Update the daemon protocol', {
				standing: { label: 'Conflicts', tone: 'danger', icon: 'icon-[lucide--git-merge-conflict]' },
				actions: [
					{
						id: 'resolve-conflicts',
						label: 'Resolve conflicts',
						icon: 'icon-[lucide--git-merge-conflict]'
					}
				]
			}),
			workspace('merged', 'Run checks, lint and tests in CI', {
				standing: merged,
				actions: [
					{
						id: 'continue',
						label: 'Continue',
						icon: 'icon-[lucide--git-branch-plus]',
						aside: true
					},
					{ id: 'archive', label: 'Archive', icon: 'icon-[lucide--archive]' }
				]
			}),
			workspace('plain', 'Try out the new parser', {
				repoId: 'sample',
				waiting: true,
				working: true,
				status: 'running',
				outcome: null
			}),
			workspace(
				'long',
				'A title that is far too long to fit into the sidebar at any sensible width',
				{
					repoId: 'sample',
					standing: ready
				}
			)
		],
		access: [],
		harnesses: null
	};

	/** Projects (FDR-012) above the repositories; what one started is listed with its repository. */
	const withProjects: Navigation = {
		...nav,
		workspaces: [
			workspace('project', 'Ship the protocol bump everywhere', {
				repoId: null,
				branch: null,
				status: 'running',
				working: true,
				outcome: null
			}),
			workspace('project-quiet', 'Triage this week’s issues', { repoId: null, branch: null }),
			workspace('bump', 'Bump the protocol in the daemon', {
				parentId: 'project',
				status: 'running',
				working: true,
				outcome: null
			}),
			...nav.workspaces
		]
	};
</script>

{#snippet frame(nav: Navigation | undefined, path: string, lost = false)}
	<!-- as the layout holds it: in the frame, as tall as the window -->
	<div class="flex h-dvh w-64 bg-frame p-2">
		<Sidebar {nav} {path} {folded} {focus} {lost} />
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

<Story
	name="Workspace action pills"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const label of ['Merge PR', 'Fix errors', 'Resolve conflicts', 'Archive']) {
			const pill = canvas.getByText(label, { selector: 'button' });
			const row = within(pill.closest('li')!);
			row.getByRole('link').focus();
			await waitFor(() => expect(pill).toHaveStyle({ opacity: '1' }));
			pill.focus();
			await expect(pill).toHaveFocus();
		}
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

<Story
	name="Focus a repository"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// shown on hover only, where it is not in the accessibility tree
		const only = canvasElement.querySelector('[aria-label="Show only sample-project"]');
		await fireEvent.click(only!);
		// the others slide away
		await waitFor(() => expect(canvas.queryByText('Raise light mode text contrast')).toBeNull());
		await expect(canvas.getByText('Try out the new parser')).toBeVisible();
		await fireEvent.click(canvas.getByRole('button', { name: 'Show 1 other repository' }));
		await waitFor(() => expect(canvas.getByText('Raise light mode text contrast')).toBeVisible());
	}}
>
	{@render frame(nav, '/workspaces/plain')}
</Story>

<Story
	name="With projects"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText('Projects')).toBeVisible();
		await expect(canvas.queryByRole('link', { name: 'New project' })).toBeNull();
		await expect(canvas.getByRole('link', { name: /Bump the protocol/ })).toHaveAttribute(
			'title',
			'Started by the agent in "Ship the protocol bump everywhere"'
		);
	}}
>
	{@render frame(withProjects, '/workspaces/project')}
</Story>

<Story
	name="Open or fold a repository"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const repo = canvas.getByRole('link', { name: 'sample-project' });
		await expect(repo).toHaveAttribute('href', '/repos/sample');
		await fireEvent.click(canvas.getByRole('button', { name: 'Collapse sample-project' }));
		await expect(repo).toBeVisible();
		await expect(canvas.getByRole('button', { name: 'Expand sample-project' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
		await fireEvent.click(canvas.getByRole('button', { name: 'Expand sample-project' }));
	}}
>
	{@render frame(nav, '/repos/sample')}
</Story>
