<script module lang="ts">
	import { expect, within } from 'storybook/test';
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

	const onaction = () => {};
</script>

{#snippet bar(
	state: Parameters<typeof actionsFor>[0],
	pending: ('fix-checks' | 'merge-upstream')[] = [],
	working = false
)}
	{@const pull = state.upstream?.pull}
	<WorkspaceActions
		standing={standingOf(state)}
		pull={pull && { number: pull.number, url: 'https://example.com/pull/42' }}
		actions={actionsFor(state)}
		{pending}
		{working}
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

<Story name="Ready to merge" asChild
	>{@render bar({ changes: pushed, upstream: upstream({}) })}</Story
>

<Story name="Blocked three ways" asChild>
	{@render bar({
		changes: dirty,
		upstream: upstream({ checks: failing, review: 'changes_requested' })
	})}
</Story>

<Story name="Conflicts with its base" asChild
	>{@render bar({ changes: pushed, upstream: upstream({ conflicts: true }) })}</Story
>

<Story name="Asked for, not done yet" asChild>
	{@render bar({ changes: pushed, upstream: upstream({ checks: failing }) }, ['fix-checks'])}
</Story>

<Story name="Checks running with rotating icon" asChild>
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

<Story name="Finding out how it stands" asChild>
	<WorkspaceActions standing={null} actions={[]} checking {onaction} />
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
	name="Update before Create PR"
	asChild
	play={async ({ canvasElement }) => {
		const buttons = within(canvasElement).getAllByRole('button');
		await expect(buttons.map((button) => button.textContent?.trim())).toEqual([
			'Update',
			'Create PR'
		]);
	}}
>
	{@render bar({
		changes: { ...dirty, incoming: { branch: 'refs/remotes/origin/main', commits: 3 } },
		upstream: upstream(null)
	})}
</Story>
