<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { PullRequest, Upstream } from '@geordi/protocol';
	import { actionsFor } from '#lib/actions.ts';
	import WorkspaceActions from './WorkspaceActions.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Workspace actions', component: WorkspaceActions });

	const file = { path: 'a.txt', added: 1, removed: 0 };
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

<!-- Each story is a state a workspace can be in; the buttons are what `actionsFor` makes of it. -->
<Story name="Work to publish" asChild>
	<WorkspaceActions actions={actionsFor({ changes: dirty, upstream: upstream(null) })} {onaction} />
</Story>

<Story name="Ready to merge" asChild>
	<WorkspaceActions actions={actionsFor({ changes: pushed, upstream: upstream({}) })} {onaction} />
</Story>

<Story name="Blocked three ways" asChild>
	<WorkspaceActions
		actions={actionsFor({
			changes: dirty,
			upstream: upstream({ checks: failing, review: 'changes_requested' })
		})}
		{onaction}
	/>
</Story>

<Story name="Asked for, not done yet" asChild>
	<WorkspaceActions
		actions={actionsFor({ changes: pushed, upstream: upstream({ checks: failing }) })}
		pending={['fix-checks']}
		{onaction}
	/>
</Story>

<Story name="Merged" asChild>
	<WorkspaceActions
		actions={actionsFor({ changes: pushed, upstream: upstream({ state: 'merged' }) })}
		{onaction}
	/>
</Story>
