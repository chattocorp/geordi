<script module lang="ts">
	import { expect, fireEvent, waitFor, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { WorkspaceStanding } from '@geordi/ui/actions';
	import type { Navigation } from '#lib/server/views.ts';
	import type { OutlineEntry } from '#lib/family.ts';
	import ContextMenu from '#lib/ui/ContextMenu.svelte';
	import Sidebar from './Sidebar.svelte';

	const { Story } = defineMeta({
		title: 'Geordi/Sidebar',
		component: Sidebar,
		beforeEach() {
			filters.activeOnly = true;
			focus.current = null;
			zoom.current = null;
			folded.current = [];
			arrived.current = false;
			loaded.current = false;
		}
	});

	type Item = Navigation['workspaces'][number];

	/** What is folded away: in the app, remembered in the browser. */
	const folded = $state({ current: [] as string[] });
	/** The repository shown alone: in the app, remembered in the browser too. */
	const focus = $state({ current: null as string | null });
	/** The item zoomed into: in the app, remembered in the browser too. */
	const zoom = $state({ current: null as string | null });

	const filters = $state({ activeOnly: true });
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
		preferences: { identifyClaude: false },
		activeAgents: [],
		harnesses: null,
		items: []
	};

	/**
	 * The outline the navigation view would send (FDR-019): an item for each workspace, under
	 * its parent's (or where `under` puts it), and the `extra` items without workspaces.
	 */
	function withItems(
		nav: Navigation,
		extra: OutlineEntry[] = [],
		under: Record<string, string> = {}
	): Navigation {
		if (nav.items.length) return nav;
		return {
			...nav,
			items: [
				...extra,
				...nav.workspaces.map((each) => ({
					id: each.id,
					parentId: under[each.id] ?? each.parentId,
					text: each.title,
					note: '',
					done: false,
					workspace: true
				}))
			]
		};
	}
	const item = (id: string, text: string, parentId: string | null = null, done = false) => ({
		id,
		parentId,
		text,
		note: '',
		done,
		workspace: false
	});

	/** Workspaces under items without one: a release, with its todos, one of them done. */
	const withPlainItems = (base: Navigation) =>
		withItems(
			base,
			[
				item('release', 'Release 0.9'),
				item('notes', 'Write the release notes', 'release'),
				item('tagged', 'Tag the release', 'release', true)
			],
			{ failing: 'release' }
		);

	/** A tree with a workspace of another repository in it (FDR-016): listed with its root. */
	const acrossRepos: Navigation = {
		...nav,
		workspaces: [
			...nav.workspaces,
			workspace('abroad', 'Teach the sample parser the new syntax', {
				repoId: 'sample',
				parentId: 'failing'
			})
		]
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
	<div class="flex h-dvh max-h-full w-64 bg-frame p-2">
		<Sidebar
			nav={nav && withItems(nav)}
			{path}
			{folded}
			{focus}
			{zoom}
			bind:activeOnly={filters.activeOnly}
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
		// nothing to do on it but add an item under it or zoom into it, which show when pointed at
		await expect(
			cleanRow
				.queryAllByRole('button')
				.filter(
					(button) => !/^(Add an item|Zoom into)/.test(button.getAttribute('aria-label') ?? '')
				)
		).toEqual([]);
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
	name="Inactive"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const activeOnly = canvas.getByRole('button', { name: 'Show only what is active' });
		await expect(activeOnly).toHaveAttribute('aria-pressed', 'true');
		await waitFor(() => expect(canvas.getByText('Choose a storage engine')).toBeVisible());
		await waitFor(() =>
			expect(canvas.queryByText('Scale live views and the event log')).toBeNull()
		);
		// put aside with the workspace whose agent started it
		await expect(canvas.queryByText('Review the daemon')).toBeNull();
		await fireEvent.click(canvas.getByRole('button', { name: 'Repository: All repositories' }));
		await fireEvent.click(await canvas.findByRole('option', { name: 'sample-project' }));
		await expect(canvas.getByText('Everything is done or put aside.')).toBeVisible();
		await fireEvent.click(activeOnly);
		await expect(activeOnly).toHaveAttribute('aria-pressed', 'false');
		await waitFor(() => expect(canvas.getByText('Try out the new parser')).toBeVisible());
		await fireEvent.click(canvas.getByRole('button', { name: 'Repository: sample-project' }));
		await fireEvent.click(await canvas.findByRole('option', { name: 'All repositories' }));
		await waitFor(() => expect(canvas.getByText('Review the daemon')).toBeVisible());
	}}
>
	{@render frame(
		{
			...nav,
			workspaces: nav.workspaces.map((w) =>
				w.id === 'working' || w.id === 'aide' || w.repoId === 'sample'
					? { ...w, inactive: true }
					: w
			)
		},
		'/'
	)}
</Story>

<Story
	name="Inactive, on screen"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// the workspace on screen stays in the list, though it is inactive; what it started does not
		await waitFor(() =>
			expect(canvas.getByText('Scale live views and the event log')).toBeVisible()
		);
		await expect(canvas.queryByText('Review the daemon')).toBeNull();
	}}
>
	{@render frame(
		{
			...nav,
			workspaces: nav.workspaces.map((w) =>
				w.id === 'working' || w.id === 'aide' ? { ...w, inactive: true } : w
			)
		},
		'/workspaces/working'
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
	name="Reorder"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const row = (title: string) => canvas.getByText(title).closest('li')!;
		const first = row('Choose a storage engine');
		// a workspace of another repository
		const target = row('Try out the new parser');
		await fireEvent.dragStart(first);
		// the gap above it, shown below the row before it
		await fireEvent.dragOver(target, { clientY: target.getBoundingClientRect().top + 1 });
		await expect(target.previousElementSibling).toHaveClass('row-drop-after');
		await fireEvent.dragEnd(first);
		await expect(canvasElement.querySelectorAll('.row-drop-after')).toHaveLength(0);
	}}
>
	{@render frame(nav, '/workspaces/ready')}
</Story>

<Story
	name="A tree across repositories"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// under its parent, with its own repository's picture
		const row = canvas.getByText('Teach the sample parser the new syntax').closest('li')!;
		await expect(row.previousElementSibling).toHaveTextContent(
			'Guard shared worktrees from update and continue'
		);
		await expect(row.querySelector('img[src="/repos/sample/icon"]')).not.toBeNull();
		await expect(row.querySelector('.icon-\\[lucide--git-branch\\]')).toBeNull();
	}}
>
	{@render frame(acrossRepos, '/workspaces/abroad')}
</Story>

<Story
	name="Nest under another workspace"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const row = (title: string) => canvas.getByText(title).closest('li')!;
		const dragged = row('Try out the new parser');
		const target = row('Update the daemon protocol');
		const middle = () => {
			const rect = target.getBoundingClientRect();
			return rect.top + rect.height / 2;
		};
		await fireEvent.dragStart(dragged);
		// onto its middle: under it, lit up, with no line
		await fireEvent.dragOver(target, { clientY: middle() });
		await expect(target.querySelector('.item')).toHaveClass('bg-hover');
		await expect(canvasElement.querySelectorAll('.row-drop-after, .row-drop-before')).toHaveLength(
			0
		);
		// above it: beside it, with a line in the gap
		await fireEvent.dragOver(target, { clientY: target.getBoundingClientRect().top + 1 });
		await expect(target.previousElementSibling).toHaveClass('row-drop-after');
		await expect(target.querySelector('.item')).not.toHaveClass('bg-hover');
		await fireEvent.dragEnd(dragged);
	}}
>
	{@render frame(nav, '/workspaces/ready')}
</Story>

<Story
	name="One line for a gap"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const row = (title: string) => canvas.getByText(title).closest('li')!;
		const dragged = row('Choose a storage engine');
		const upper = row('Raise light mode text contrast');
		const lower = row('Check every token in dark mode');
		const marked = () =>
			[...canvasElement.querySelectorAll('.row-drop-after, .row-drop-before')].map((each) => [
				each.getAttribute('data-row'),
				each.className.includes('after') ? 'after' : 'before',
				(each as HTMLElement).style.getPropertyValue('--drop-indent')
			]);
		await fireEvent.dragStart(dragged);
		const x = upper.getBoundingClientRect().left + 200;
		// the bottom of the row above, and the top of the row below: the same gap, one line
		await fireEvent.dragOver(upper, {
			clientX: x,
			clientY: upper.getBoundingClientRect().bottom - 1
		});
		const fromAbove = marked();
		await fireEvent.dragOver(lower, { clientX: x, clientY: lower.getBoundingClientRect().top + 1 });
		await expect(marked()).toEqual(fromAbove);
		await expect(fromAbove).toHaveLength(1);
		await fireEvent.dragEnd(dragged);
	}}
>
	{@render frame(nav, '/workspaces/ready')}
</Story>

<Story
	name="Drop at the end of a list"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [list] = canvas.getAllByRole('list');
		const group = list;
		const rows = () => [...list.querySelectorAll(':scope > li[data-row]')];
		const last = rows().at(-1)! as HTMLElement;
		const below = () => last.getBoundingClientRect().bottom + 4;
		const line = () => list.querySelector(':scope > li.row-drop-after');

		// a nested workspace, below the last tree: last at the top, a line at full width
		const nested = canvas.getByText('Check every token in dark mode').closest('li')!;
		await fireEvent.dragStart(nested);
		await fireEvent.dragOver(group, { clientY: below() });
		await waitFor(() => expect(line()).toBe(last));
		// at the top level: its line goes all the way out
		await expect(last.style.getPropertyValue('--drop-indent')).toMatch(/\* 0\)$/);
		await fireEvent.dragLeave(group, { relatedTarget: document.body });
		await expect(line()).toBeNull();
		await fireEvent.dragEnd(nested);

		// the last one already stays where it is
		await fireEvent.dragStart(last);
		await fireEvent.dragOver(group, { clientY: below() });
		await expect(line()).toBeNull();
		await fireEvent.dragEnd(last);
	}}
>
	{@render frame(nav, '/workspaces/ready')}
</Story>

<Story
	name="Focus a repository"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await fireEvent.click(canvas.getByRole('button', { name: 'Repository: All repositories' }));
		await fireEvent.click(await canvas.findByRole('option', { name: 'sample-project' }));
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
		await expect(canvas.queryByRole('link', { name: 'New project' })).toBeNull();
		await expect(canvas.getByRole('link', { name: /Bump the protocol/ })).toHaveAttribute(
			'title',
			'Reports to "Ship the protocol bump everywhere"'
		);
	}}
>
	{@render frame(withProjects, '/workspaces/project')}
</Story>

<Story
	name="Items without workspaces"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const release = canvas.getByRole('textbox', { name: 'Release 0.9' });
		await expect(release).toHaveValue('Release 0.9');
		const row = (text: string) =>
			canvas.getByText(text, { selector: 'a span, a' }).closest('li')! as HTMLElement;
		// a workspace under an item without one sits in from it
		const releaseRow = release.closest('li')!;
		const failingRow = row('Guard shared worktrees from update and continue');
		await expect(failingRow.getBoundingClientRect().left).toBeGreaterThan(
			releaseRow.getBoundingClientRect().left
		);
		await expect(releaseRow.compareDocumentPosition(failingRow)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING
		);
		// what is ticked off stays, crossed out, also among only what is active
		const tagged = canvas.getByRole('textbox', { name: 'Tag the release' });
		await expect(tagged).toHaveClass('line-through');
		await expect(
			canvas.getByRole('button', { name: 'Mark “Tag the release” as not done' })
		).toHaveAttribute('aria-pressed', 'true');
		// it can be removed from its row; what is not done is added to instead
		const offered = (label: string) => canvasElement.querySelector(`button[aria-label="${label}"]`);
		await expect(offered('Remove Tag the release')).not.toBeNull();
		await expect(offered('Add an item under Tag the release')).toBeNull();
		await expect(offered('Remove Write the release notes')).toBeNull();
		await expect(offered('Add an item under Write the release notes')).not.toBeNull();
		// every row can be zoomed into from a button too, a workspace's as well
		await expect(offered('Zoom into Release 0.9')).not.toBeNull();
		await expect(
			offered('Zoom into Guard shared worktrees from update and continue')
		).not.toBeNull();
		// it folds what is under it
		await fireEvent.click(canvas.getByRole('button', { name: 'Collapse Release 0.9' }));
		await waitFor(() =>
			expect(canvas.queryByRole('textbox', { name: 'Write the release notes' })).toBeNull()
		);
	}}
>
	{@render frame(withPlainItems(nav), '/workspaces/ready')}
</Story>

<Story
	name="Zoom into an item"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Cmd-. on a row zooms into it: its branch is all there is, under it as a heading
		await fireEvent.keyDown(canvas.getByRole('textbox', { name: 'Release 0.9' }), {
			key: '.',
			code: 'Period',
			metaKey: true
		});
		await expect(await canvas.findByRole('heading', { name: 'Release 0.9' })).toBeVisible();
		await expect(canvas.getByRole('textbox', { name: 'Write the release notes' })).toBeVisible();
		await waitFor(() => expect(canvas.queryByText('Choose a storage engine')).toBeNull());
		// its sign leads back up
		await fireEvent.click(canvas.getByRole('button', { name: 'Zoom out to Outline' }));
		await waitFor(() => expect(canvas.getByText('Choose a storage engine')).toBeVisible());
		await expect(canvas.queryByRole('heading', { name: 'Release 0.9' })).toBeNull();
	}}
>
	{@render frame(withPlainItems(nav), '/workspaces/ready')}
</Story>

<Story
	name="Adding items"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// the outline's last line is where something new is written
		const [list] = canvas.getAllByRole('list');
		const last = [...list.querySelectorAll(':scope > li')].at(-1)!;
		await expect(
			within(last as HTMLElement).getByRole('button', { name: 'New item' })
		).toBeVisible();
		// every row offers to add an item under it, when pointed at
		// shown only while a row is pointed at: no room taken from titles otherwise
		const addUnder = (title: string) =>
			canvasElement.querySelector(`button[aria-label="Add an item under ${title}"]`);
		await expect(addUnder('Release 0.9')).not.toBeVisible();
		await expect(addUnder('Raise light mode text contrast')).not.toBeNull();
	}}
>
	{@render frame(withPlainItems(nav), '/workspaces/ready')}
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
