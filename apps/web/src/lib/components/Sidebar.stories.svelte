<script module lang="ts">
	import { expect, fireEvent, waitFor, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { WorkspaceStanding } from '@geordi/ui/actions';
	import type { Navigation } from '#lib/server/views.ts';
	import { activeOnDay } from '#lib/family.ts';
	import ContextMenu from '#lib/ui/ContextMenu.svelte';
	import Sidebar from './Sidebar.svelte';

	const { Story } = defineMeta({
		title: 'Geordi/Sidebar',
		component: Sidebar,
		beforeEach() {
			filters.todayOnly = false;
			focus.current = null;
			folded.current = [];
			grouped.current = true;
			arrived.current = false;
			loaded.current = false;
		}
	});

	type Item = Navigation['workspaces'][number];

	/** What is folded away: in the app, remembered in the browser. */
	const folded = $state({ current: [] as string[] });
	/** The repository shown alone: in the app, remembered in the browser too. */
	const focus = $state({ current: null as string | null });
	/** Whether workspaces are grouped by repository: in the app, remembered in the browser too. */
	const grouped = $state({ current: true });

	const filters = $state({ todayOnly: false });
	/** Whether a workspace has come along since the story began. */
	const arrived = $state({ current: false });
	/** Whether navigation has arrived, in the story where it comes late. */
	const loaded = $state({ current: false });

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
		deferred: false,
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
			workspace('tokens', 'Check every token in dark mode', {
				parentId: 'ready',
				actions: [{ id: 'archive', label: 'Archive', icon: 'icon-[lucide--archive]' }]
			}),
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
		activeAgents: [],
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

{#snippet frame(
	nav: Navigation | undefined,
	path: string,
	lost = false,
	day = new Date(2026, 10, 20).toDateString()
)}
	<!-- as the layout holds it: in the frame, as tall as the window -->
	<div class="flex h-dvh max-h-full w-64 bg-frame p-2">
		<Sidebar
			visibleWorkspaces={activeOnDay(nav?.workspaces ?? [], filters.todayOnly ? day : null)}
			{nav}
			{path}
			{folded}
			{focus}
			{grouped}
			bind:todayOnly={filters.todayOnly}
			{lost}
		/>
	</div>
{/snippet}

<Story
	name="Workspaces"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('link', { name: /^Raise light mode/ })).toHaveAttribute(
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
	name="A workspace comes and goes"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const sliding = (element: Element) => expect(element.getAnimations().length).toBeGreaterThan(0);
		// what is there when navigation arrives does not slide in
		loaded.current = true;
		const group = (await canvas.findByText('Try out the new parser')).closest('ul')!.parentElement!;
		await expect(group.getAnimations()).toHaveLength(0);
		arrived.current = true;
		const row = (await canvas.findByText('Just started')).closest('li')!;
		await sliding(row);
		arrived.current = false;
		await sliding(row);
		await waitFor(() => expect(canvas.queryByText('Just started')).toBeNull());
	}}
>
	{@render frame(
		loaded.current
			? {
					...nav,
					workspaces: arrived.current
						? [workspace('new', 'Just started', { repoId: 'sample' }), ...nav.workspaces]
						: nav.workspaces
				}
			: undefined,
		'/workspaces/ready'
	)}
</Story>

<Story
	name="Workspace action pills"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const idle = canvas.getByRole('link', { name: /Check every token/ });
		idle.focus();
		const cleanRow = within(idle.closest('li')!);
		await expect(cleanRow.queryByRole('button')).toBeNull();
		await expect(cleanRow.queryByRole('img')).toBeNull();
		for (const label of ['Merge PR', 'Fix errors', 'Resolve conflicts', 'Archive']) {
			const pill = canvas.getByText(label, { selector: 'button' });
			const row = within(pill.closest('li')!);
			await expect(pill).toHaveStyle({ cursor: 'pointer' });
			await expect(getComputedStyle(pill).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
			const diameter = pill.getBoundingClientRect().height;
			await expect(pill.getBoundingClientRect().width).toBe(diameter);
			row.getByRole('link').focus();
			await waitFor(() => expect(pill.clientWidth).toBeGreaterThanOrEqual(pill.scrollWidth));
			pill.focus();
			await expect(pill).toHaveFocus();
			const { left, right, top, height } = pill.getBoundingClientRect();
			for (const x of [left + 3, (left + right) / 2, right - 3]) {
				const target = document.elementFromPoint(x, top + height / 2);
				await expect(target?.closest('button')).toBe(pill);
			}
		}
	}}
>
	{@render frame(nav, '/workspaces/ready')}
</Story>

<Story
	name="Active today"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const today = canvas.getByRole('button', { name: 'Show workspaces active today' });
		await fireEvent.click(today);
		await expect(today).toHaveAttribute('aria-pressed', 'true');
		await waitFor(() => expect(canvas.getByText('Review the daemon')).toBeVisible());
		await waitFor(() =>
			expect(canvas.queryByText('Scale live views and the event log')).toBeNull()
		);
		await fireEvent.click(canvas.getByRole('button', { name: 'Repository: All repositories' }));
		await fireEvent.click(await canvas.findByRole('option', { name: 'sample-project' }));
		await expect(canvas.getByText('No workspaces active today.')).toBeVisible();
		await fireEvent.click(today);
		await waitFor(() => expect(canvas.getByText('Try out the new parser')).toBeVisible());
		await fireEvent.click(canvas.getByRole('button', { name: 'Repository: sample-project' }));
		await fireEvent.click(await canvas.findByRole('option', { name: 'All repositories' }));
	}}
>
	{@render frame(
		{
			...nav,
			workspaces: nav.workspaces.map((w) =>
				w.id === 'aide'
					? { ...w, updatedAt: new Date(2026, 10, 20).toISOString() }
					: { ...w, updatedAt: new Date(2026, 10, 19, 23, 59).toISOString() }
			)
		},
		'/',
		false,
		new Date(2026, 10, 20).toDateString()
	)}
</Story>

<Story
	name="Scrollable workspace list"
	asChild
	play={async ({ canvasElement }) => {
		const list = canvasElement.querySelector<HTMLElement>('.scroll-fade')!;
		await waitFor(() => expect(list).toHaveClass('more-below'));
		await expect(list).not.toHaveClass('more-above');
		list.scrollTop = (list.scrollHeight - list.clientHeight) / 2;
		await waitFor(() => expect(list).toHaveClass('more-above', 'more-below'));
		list.scrollTop = list.scrollHeight;
		await waitFor(() => expect(list).not.toHaveClass('more-below'));
		await expect(list).toHaveClass('more-above');
		list.scrollTop = 0;
	}}
>
	<div class="h-96">
		{@render frame(withProjects, '/workspaces/ready')}
	</div>
</Story>

<Story
	name="As one list"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await fireEvent.click(canvas.getByRole('button', { name: 'Show workspaces as one list' }));
		await expect(grouped.current).toBe(false);
		// no repository names above them: each has its repository's picture instead
		await waitFor(() => expect(canvas.queryByText('Projects')).toBeNull());
		const main = within(canvas.getByRole('navigation', { name: 'Main' }));
		// the titles, without the links to parents beside them
		const titles = main
			.getAllByRole('link')
			.map((link) => link.textContent?.trim())
			.filter(Boolean);
		// what a project's agent started stays under it, though it is in a repository
		await expect(titles.indexOf('Bump the protocol in the daemon')).toBe(
			titles.indexOf('Ship the protocol bump everywhere') + 1
		);
	}}
>
	{@render frame(withProjects, '/workspaces/ready')}
</Story>

<Story name="On the archive" asChild>
	{@render frame(nav, '/archive')}
</Story>

<Story
	name="Nothing yet"
	asChild
	play={async ({ canvasElement }) => {
		const menu = within(canvasElement).getByRole('navigation', { name: 'Workspace navigation' });
		const [create, archive, settings] = within(menu).getAllByRole('link');
		await expect(create).toHaveAccessibleName('New workspace');
		await expect(create).toHaveAttribute('aria-current', 'page');
		await expect(archive).toHaveAccessibleName('Archive');
		await expect(settings).toHaveAccessibleName(/Settings/);
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
	name="Reorder in one list"
	asChild
	play={async ({ canvasElement }) => {
		grouped.current = false;
		const canvas = within(canvasElement);
		// the groups slide away
		await waitFor(() => expect(canvas.getAllByText('Choose a storage engine')).toHaveLength(1));
		const row = (title: string) => canvas.getByText(title).closest('li')!;
		const first = row('Choose a storage engine');
		// a workspace of another repository
		const target = row('Try out the new parser');
		await fireEvent.dragStart(first);
		await fireEvent.dragOver(target, { clientY: target.getBoundingClientRect().top + 1 });
		await expect(target).toHaveClass('row-drop-before');
		await fireEvent.dragEnd(first);
		await expect(canvasElement.querySelectorAll('.row-drop-before')).toHaveLength(0);
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
		await waitFor(() => expect(canvas.getByText('Try out the new parser')).toBeVisible());
		await fireEvent.click(canvas.getByRole('button', { name: 'Repository: sample-project' }));
		await fireEvent.click(await canvas.findByRole('option', { name: 'All repositories' }));
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
		await expect(
			canvas.getByRole('link', { name: 'Open parent workspace: Ship the protocol bump everywhere' })
		).toHaveAttribute('href', '/workspaces/project');
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
	name="Fold a repository from its name"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const repo = canvas.getByRole('button', { name: 'Collapse sample-project' });
		await fireEvent.click(within(repo).getByText('sample-project'));
		await expect(repo).toBeVisible();
		await expect(within(repo).getByText('2')).toBeVisible();
		await expect(canvas.queryByText('Try out the new parser')).toBeNull();
		await expect(canvas.getByRole('button', { name: 'Expand sample-project' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
		await fireEvent.click(canvas.getByRole('button', { name: 'Expand sample-project' }));
		await waitFor(() => expect(canvas.getByText('Try out the new parser')).toBeVisible());
	}}
>
	{@render frame(nav, '/workspaces/plain')}
</Story>

<Story
	name="Rename workspace"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await fireEvent.contextMenu(canvas.getByText('Raise light mode text contrast'));
		await fireEvent.click(await canvas.findByRole('menuitem', { name: 'Rename workspace' }));
		const field = await canvas.findByRole('textbox', { name: 'Workspace name' });
		await expect(field).toHaveValue('Raise light mode text contrast');
		await expect(field).toHaveFocus();
		await fireEvent.input(field, { target: { value: '  ' } });
		await expect(canvas.getByRole('button', { name: 'Rename' })).toBeDisabled();
		await fireEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
		await expect(canvas.queryByRole('dialog')).toBeNull();
	}}
>
	{@render frame(nav, '/workspaces/ready')}
	<ContextMenu />
</Story>

<Story
	name="Not Today"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await fireEvent.contextMenu(canvas.getByText('Review the daemon'));
		const defer = await canvas.findByRole('menuitem', { name: 'Not Today' });
		await expect(defer).toBeVisible();
		await expect(defer.nextElementSibling).toBe(canvas.getByRole('menuitem', { name: 'Archive' }));
	}}
>
	{@render frame(
		{
			...nav,
			workspaces: [workspace('aide', 'Review the daemon', { updatedAt: new Date().toISOString() })]
		},
		'/'
	)}
	<ContextMenu />
</Story>

<Story
	name="Set aside in Today"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const targets = () => canvas.queryAllByRole('group', { name: 'Set aside' });
		await expect(targets()).toHaveLength(0);
		await fireEvent.click(canvas.getByRole('button', { name: 'Show workspaces active today' }));
		await expect(targets()).toHaveLength(2);
		const [own, other] = targets();
		await expect(within(own).getByText('1')).toBeVisible();
		const row = canvas.getByText('Review the daemon').closest('li')!;
		await fireEvent.dragStart(row);
		await expect(within(own).getByText('Drop to set aside')).toBeVisible();
		await expect(within(other).queryByText('Drop to set aside')).toBeNull();
		await fireEvent.dragEnd(row);
		await fireEvent.click(canvas.getByRole('button', { name: 'Show workspaces as one list' }));
		await waitFor(() => expect(targets()).toHaveLength(1));
		await expect(within(targets()[0]).getByText('2')).toBeVisible();
	}}
>
	{@render frame(
		{
			...nav,
			workspaces: [
				workspace('active', 'Review the daemon', {
					updatedAt: new Date(2026, 10, 20).toISOString()
				}),
				workspace('later', 'Revisit the parser', { deferred: true }),
				workspace('another', 'Review the styling', { repoId: 'sample', deferred: true })
			]
		},
		'/'
	)}
</Story>
