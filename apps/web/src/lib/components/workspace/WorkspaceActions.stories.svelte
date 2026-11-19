<script module lang="ts">
	import type { ComponentProps } from 'svelte';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { PullRequest, Upstream } from '@geordi/protocol';
	import { actionsFor, standingOf } from '@geordi/ui/actions';
	import WorkspaceActions from '@geordi/ui/WorkspaceActions.svelte';

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
	activity: Pick<
		ComponentProps<typeof WorkspaceActions>,
		'pending' | 'asking' | 'compact' | 'unreachable'
	> = {}
)}
	{@const pull = state.upstream?.pull}
	<WorkspaceActions
		standing={standingOf(state)}
		pull={pull && { number: pull.number, url: 'https://example.com/pull/42' }}
		actions={actionsFor(state)}
		{...activity}
		{onopenpull}
		{onaction}
	/>
{/snippet}

<!-- Each story is a state a workspace can be in; the bar is what `standingOf` and `actionsFor` make of it. -->
<Story
	name="Creating PR with uncommitted changes"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText('Working')).not.toBeInTheDocument();
		await expect(canvas.getByText('Uncommitted changes')).toBeVisible();
		await expect(canvas.getByRole('button', { name: /Create PR/ })).toBeDisabled();
	}}
>
	{@render bar({ changes: dirty, upstream: upstream(null) }, { pending: ['create-pull'] })}
</Story>

<Story
	name="Committed work on a forge that is not set up"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const link = canvas.getByRole('link', { name: 'Forge not set up' });
		await expect(link).toHaveAttribute('title', expect.stringContaining('git.example.com'));
		await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
	}}
>
	{@render bar({
		changes: { ...pushed, unpushed: null, unknownForge: 'git.example.com' },
		upstream: null
	})}
</Story>

<Story
	name="Pushed branch awaiting a pull request"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('button', { name: 'Create PR' })).toBeVisible();
		await expect(canvas.getByText('Branch pushed')).toBeVisible();
	}}
>
	{@render bar({ changes: pushed, upstream: upstream(null) })}
</Story>

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
	{@render bar(
		{ changes: pushed, upstream: upstream({ draft: true }) },
		{ pending: ['ready-for-review'] }
	)}
</Story>

<Story name="Ready to merge" asChild
	>{@render bar({ changes: pushed, upstream: upstream({}) })}</Story
>

<Story
	name="Merge blocked by rules"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText('Merge blocked')).toBeVisible();
		await expect(canvas.queryByRole('button', { name: /Merge PR/ })).toBeNull();
	}}
>
	{@render bar({ changes: pushed, upstream: upstream({ blocked: 'rules' }) })}
</Story>

<Story name="Behind base branch, which must be up to date" asChild
	>{@render bar({
		changes: { ...pushed, incoming: { branch: 'refs/remotes/origin/main', commits: 3 } },
		upstream: upstream({ blocked: 'behind' })
	})}</Story
>

<Story
	name="Waiting for merged standing"
	asChild
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole('button', { name: /Merge PR/ })).toBeDisabled();
	}}
>
	{@render bar({ changes: pushed, upstream: upstream({}) }, { pending: ['merge-pull'] })}
</Story>

<Story
	name="Failing checks with sync"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('button', { name: 'Sync 1 incoming commit' })).toBeVisible();
		await expect(canvas.getByRole('button', { name: 'Fix errors' })).toHaveStyle({
			color: getComputedStyle(canvas.getByText('Checks failing')).color
		});
	}}
>
	{@render bar({
		changes: { ...pushed, incoming: { branch: 'refs/remotes/origin/main', commits: 1 } },
		upstream: upstream({ checks: failing })
	})}
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

<Story
	name="Turn failed"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('button', { name: 'Retry' })).toHaveStyle({
			color: getComputedStyle(canvas.getByText('Turn failed')).color
		});
	}}
>
	{@render bar({ changes: dirty, upstream: upstream(null), failed: true })}
</Story>

<Story name="Asked for, not done yet" asChild>
	{@render bar(
		{ changes: pushed, upstream: upstream({ checks: failing }) },
		{ pending: ['fix-checks'] }
	)}
</Story>

<Story name="Checks running with slowly rotating icon" asChild>
	{@render bar({
		changes: pushed,
		upstream: upstream({ checks: { state: 'pending', total: 3, failed: 0, url: null } })
	})}
</Story>

<Story name="Checking" asChild>
	<WorkspaceActions
		standing={{
			label: 'Checking…',
			tone: 'neutral',
			icon: 'icon-[lucide--circle-dashed] animate-checks-spin'
		}}
		actions={[]}
		{onopenpull}
		{onaction}
	/>
</Story>

<Story name="Merged" asChild>
	{@render bar({ changes: pushed, upstream: upstream({ state: 'merged' }) })}
</Story>

<Story
	name="Archiving"
	asChild
	play={async ({ canvasElement }) => {
		const button = within(canvasElement).getByRole('button', { name: /Archive$/ });
		await expect(button).toBeDisabled();
		await expect(button).toHaveAttribute('aria-busy', 'true');
	}}
>
	{@render bar(
		{ changes: pushed, upstream: upstream({ state: 'merged' }) },
		{ pending: ['archive'] }
	)}
</Story>

<Story
	name="Waiting for an answer"
	asChild
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
			'Waiting for your answer'
		);
	}}
>
	{@render bar({ changes: null, upstream: null }, { asking: true })}
</Story>

<Story
	name="Before the first result"
	asChild
	play={async ({ canvasElement }) => {
		await expect(
			within(canvasElement).queryByRole('group', { name: 'Next steps' })
		).not.toBeInTheDocument();
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

<Story name="Upstream commits with auto-merge enabled" asChild>
	{@render bar({
		changes: { ...pushed, incoming: { branch: 'refs/remotes/origin/main', commits: 2 } },
		upstream: upstream({
			checks: { state: 'pending', total: 3, failed: 0, url: null },
			autoMerge: { enabled: true, canEnable: false, canDisable: true }
		})
	})}
</Story>

<Story name="Merging upstream" asChild>
	{@render bar(
		{
			changes: { ...pushed, incoming: { branch: 'refs/remotes/origin/main', commits: 3 } },
			upstream: upstream(null)
		},
		{ pending: ['merge-upstream'] }
	)}
</Story>

<Story
	name="Only upstream commits"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText('Behind base branch')).toBeVisible();
		const sync = canvas.getByRole('button', { name: 'Sync 1 incoming commit' });
		await expect(within(sync).getByText('1')).toHaveClass('opacity-60');
	}}
>
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
		await expect(buttons[0]).toHaveAccessibleName('Sync 3 incoming commits');
		await expect(buttons[1]).toHaveAccessibleName('Create PR');
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
		await expect(
			within(canvasElement).getByRole('button', { name: 'Disable Auto-merge' })
		).toBeEnabled();
	}}
>
	{@render bar({
		changes: pushed,
		upstream: upstream({ autoMerge: { enabled: true, canEnable: false, canDisable: true } })
	})}
</Story>

<Story
	name="Checks running with auto-merge enabled"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText('Checks running')).toBeVisible();
		await expect(canvas.getByRole('button', { name: 'Disable Auto-merge' })).toBeEnabled();
	}}
>
	{@render bar({
		changes: pushed,
		upstream: upstream({
			checks: { state: 'pending', total: 3, failed: 0, url: null },
			autoMerge: { enabled: true, canEnable: false, canDisable: true }
		})
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

<Story
	name="Merge, not auto-merge, once ready"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('button', { name: /Merge PR/ })).toBeEnabled();
		await expect(canvas.queryByRole('button', { name: 'Auto-merge' })).toBeNull();
	}}
>
	{@render bar({
		changes: pushed,
		upstream: upstream({
			checks: { state: 'success', total: 3, failed: 0, url: null },
			autoMerge: { enabled: false, canEnable: true, canDisable: false }
		})
	})}
</Story>

<!-- Small, with only the next step: as on the overview's cards. -->
<Story
	name="Compact"
	asChild
	play={async ({ canvasElement }) => {
		// blocked three ways, it offers only the most pressing of them
		const [blocked] = within(canvasElement).getAllByRole('group', { name: 'Next steps' });
		await expect(within(blocked).getAllByRole('button')).toHaveLength(1);
		// The compact ribbon fits inside its card, including when it shows a question.
		const card = canvasElement.querySelector('.w-72')!;
		for (const group of within(canvasElement).getAllByRole('group', { name: 'Next steps' }))
			await expect(group.getBoundingClientRect().right).toBeLessThanOrEqual(
				card.getBoundingClientRect().right
			);
	}}
>
	<div class="flex w-72 flex-col gap-3">
		{@render bar(
			{ changes: dirty, upstream: upstream({ checks: failing, review: 'changes_requested' }) },
			{ compact: true }
		)}
		{@render bar({ changes: pushed, upstream: upstream({}) }, { compact: true })}
		{@render bar(
			{ changes: pushed, upstream: upstream({ checks: failing }) },
			{ asking: true, compact: true }
		)}
		{@render bar(
			{ changes: pushed, upstream: upstream({ conflicts: true }) },
			{ asking: true, compact: true }
		)}
		{@render bar({ changes: pushed, upstream: upstream({ state: 'merged' }) }, { compact: true })}
	</div>
</Story>

<!-- The forge does not answer: what was last known stays, and a quiet sign says that it may be old. -->
<Story
	name="Forge unreachable"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('img', { name: /cannot be reached/ })).toBeVisible();
		await expect(canvas.getByText('Ready to merge')).toBeVisible();
	}}
>
	{@render bar(
		{ changes: pushed, upstream: upstream({}) },
		{ unreachable: 'GitHub did not answer' }
	)}
</Story>
