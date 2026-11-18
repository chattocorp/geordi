<script module lang="ts">
	import { expect, within } from 'storybook/test';
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
