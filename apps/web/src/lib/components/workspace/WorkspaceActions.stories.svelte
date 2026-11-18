<script module lang="ts">
	import { expect, fn, userEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { PullRequest, Upstream } from '@geordi/protocol';
	import { actionsFor, standingOf } from '#lib/actions.ts';
	import WorkspaceActions from './WorkspaceActions.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Workspace actions', component: WorkspaceActions });

	const file = { path: 'a.txt', status: 'modified' as const, added: 1, removed: 0 };
	const upstream = (pull: Partial<PullRequest> | null): Upstream => ({
		forge: 'github',
		repo: 'acme/widgets',
		repoUrl: null,
		branch: 'geordi/abc',
		pushed: true,
		createUrl: null,
		pull: pull && {
			number: '42',
			title: 'Add the thing',
			url: null,
			state: 'open',
			draft: false,
			base: 'main',
			checks: { state: 'success', total: 3, failed: 0, url: null },
			review: null,
			...pull
		}
	});
	const pushed = { files: [file], uncommitted: 0, unpushed: 0 };
	const dirty = { files: [file], uncommitted: 1, unpushed: 0 };
	const failing = { state: 'failure', total: 3, failed: 1, url: null } as const;

	const onopenpull = fn();
	const onaction = () => {};
</script>

{#snippet bar(
	state: Parameters<typeof actionsFor>[0],
	pending: ('fix-checks' | 'merge-upstream' | 'merge-pull' | 'ready-for-review')[] = [],
	working = false
)}
	{@const pull = state.upstream?.pull}
	<WorkspaceActions
		standing={standingOf(state)}
		pull={pull && { number: pull.number, url: 'https://example.com/pull/42' }}
		actions={actionsFor(state)}
		{pending}
		{working}
		{onopenpull}
		{onaction}
	/>
{/snippet}

<!-- Each story is a state a workspace can be in; the bar is what `standingOf` and `actionsFor` make of it. -->
<Story name="Work to publish" asChild
	>{@render bar({ changes: dirty, upstream: upstream(null) })}</Story
>

<Story name="Pushed branch awaiting a pull request" asChild
	>{@render bar({ changes: pushed, upstream: upstream(null) })}</Story
>

<Story
	name="Draft pull request"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		onopenpull.mockClear();
		await userEvent.click(canvas.getByRole('button', { name: '#42' }));
		await expect(onopenpull).toHaveBeenCalledOnce();
		const external = canvas.getByRole('link', { name: 'Open pull request #42 in browser' });
		await expect(external).toHaveAttribute('href', 'https://example.com/pull/42');
		await expect(external).toHaveAttribute('target', '_blank');
		const label = canvas.getByText('#42');
		const centerY = (element: Element) => {
			const { top, height } = element.getBoundingClientRect();
			return top + height / 2;
		};
		await expect(centerY(label.previousElementSibling!)).toBeCloseTo(centerY(label));
		await expect(centerY(external.firstElementChild!)).toBeCloseTo(centerY(label));
	}}
>
	{@render bar({ changes: pushed, upstream: upstream({ draft: true }) })}
</Story>

<Story
	name="Marking draft ready for review"
	asChild
	play={async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByRole('button', { name: /Ready for review/ })
		).toBeDisabled();
	}}
>
	{@render bar({ changes: pushed, upstream: upstream({ draft: true }) }, ['ready-for-review'])}
</Story>

<Story name="Ready to merge" asChild
	>{@render bar({ changes: pushed, upstream: upstream({}) })}</Story
>

<Story
	name="Waiting for merged standing"
	asChild
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole('button', { name: /Merge PR/ })).toBeDisabled();
	}}
>
	{@render bar({ changes: pushed, upstream: upstream({}) }, ['merge-pull'])}
</Story>

<Story name="Blocked three ways" asChild>
	{@render bar({
		changes: dirty,
		upstream: upstream({ checks: failing, review: 'changes_requested' })
	})}
</Story>

<Story
	name="Conflicts with its base"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('button', { name: 'Resolve conflicts' })).toHaveStyle({
			color: getComputedStyle(canvas.getByText('Conflicts')).color
		});
	}}
>
	{@render bar({ changes: pushed, upstream: upstream({ conflicts: true }) })}
</Story>

<Story name="Asked for, not done yet" asChild>
	{@render bar({ changes: pushed, upstream: upstream({ checks: failing }) }, ['fix-checks'])}
</Story>

<Story name="Checks running with slowly rotating icon" asChild>
	{@render bar({
		changes: pushed,
		upstream: upstream({ checks: { state: 'pending', total: 3, failed: 0, url: null } })
	})}
</Story>

<Story name="Merged" asChild>
	{@render bar({ changes: pushed, upstream: upstream({ state: 'merged' }) })}
</Story>

<Story name="Agent at work, nothing else to say" asChild>
	{@render bar({ changes: { files: [], uncommitted: 0, unpushed: 0 }, upstream: null }, [], true)}
</Story>

<Story name="Agent at work on failing checks" asChild>
	{@render bar({ changes: pushed, upstream: upstream({ checks: failing }) }, ['fix-checks'], true)}
</Story>

<Story
	name="Before the first result"
	asChild
	play={async ({ canvasElement }) => {
		await expect(canvasElement).not.toHaveTextContent(/Checking/);
	}}
>
	<WorkspaceActions standing={null} actions={[]} {onopenpull} {onaction} />
</Story>

<Story name="Upstream commits available" asChild>
	{@render bar({
		changes: { ...pushed, incoming: { branch: 'refs/remotes/origin/main', commits: 3 } },
		upstream: upstream({})
	})}
</Story>

<Story name="Merging upstream" asChild>
	{@render bar(
		{
			changes: { ...pushed, incoming: { branch: 'refs/remotes/origin/main', commits: 3 } },
			upstream: upstream(null)
		},
		['merge-upstream'],
		true
	)}
</Story>

<Story name="Only upstream commits" asChild>
	{@render bar({
		changes: {
			files: [],
			uncommitted: 0,
			unpushed: 0,
			incoming: { branch: 'refs/remotes/origin/main', commits: 1 }
		},
		upstream: null
	})}
</Story>

<Story
	name="Sync before Create PR"
	asChild
	play={async ({ canvasElement }) => {
		const buttons = within(canvasElement).getAllByRole('button');
		await expect(buttons.map((button) => button.textContent?.trim())).toEqual([
			'Sync',
			'Create PR'
		]);
	}}
>
	{@render bar({
		changes: { ...dirty, incoming: { branch: 'refs/remotes/origin/main', commits: 3 } },
		upstream: upstream(null)
	})}
</Story>

<Story
	name="Auto-merge enabled"
	asChild
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole('button', { name: 'Disable' })).toBeEnabled();
	}}
>
	{@render bar({
		changes: pushed,
		upstream: upstream({ autoMerge: { enabled: true, canEnable: false, canDisable: true } })
	})}
</Story>

<Story
	name="Auto-merge while checks run"
	asChild
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole('button', { name: 'Auto-merge' })).toBeEnabled();
	}}
>
	{@render bar({
		changes: pushed,
		upstream: upstream({
			checks: { state: 'pending', total: 3, failed: 0, url: null },
			autoMerge: { enabled: false, canEnable: true, canDisable: false }
		})
	})}
</Story>
