<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, waitFor, within } from 'storybook/test';
	import { standingOf, actionsFor } from '@geordi/ui/actions';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Workspace row', component: WorkspaceRow });

	const checking = {
		changes: { files: [], uncommitted: 0, unpushed: 0 },
		upstream: {
			forge: 'github',
			repo: 'acme/widgets',
			repoUrl: null,
			branch: 'release',
			pushed: true,
			createUrl: null,
			pull: {
				number: '42',
				title: 'Release notes',
				url: null,
				state: 'open',
				draft: false,
				base: 'main',
				review: null,
				checks: {
					state: 'pending',
					total: 3,
					failed: 0,
					url: null,
					counts: { pending: 1, passed: 2, failed: 0, skipped: 0 }
				},
				autoMerge: { enabled: true, canEnable: false, canDisable: true }
			}
		}
	} satisfies Parameters<typeof standingOf>[0];

	const optionalChecks = {
		...checking,
		upstream: {
			...checking.upstream,
			pull: {
				...checking.upstream.pull,
				checks: { ...checking.upstream.pull.checks, optionalChecksRunning: true },
				autoMerge: { ...checking.upstream.pull.autoMerge, enabled: false }
			}
		}
	} satisfies Parameters<typeof standingOf>[0];
</script>

<Story
	name="Demo rows without navigation"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole('img', { name: 'Working' })).toBeVisible();
		await expect(canvas.getByRole('img', { name: 'Waiting for your answer' })).toBeVisible();
		await expect(canvas.getByRole('img', { name: 'Checks: 1 running, 2 passed' })).toBeVisible();
		await expect(canvas.queryByRole('link')).toBeNull();
		await expect(canvas.queryByRole('button')).toBeNull();
	}}
>
	<div class="w-64 space-y-px sheet-quiet p-2">
		<WorkspaceRow title="Edit the login form" working />
		<WorkspaceRow title="Choose a page" asking unread />
		<WorkspaceRow
			title="Return people after sign-in"
			current
			standing={{
				label: 'Checks running',
				tone: 'neutral',
				icon: 'icon-[lucide--circle-dashed]',
				checks: { pending: 1, passed: 2, skipped: 0, failed: 0 }
			}}
		/>
	</div>
</Story>

<Story
	name="Locked"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// in the status slot, only while there is no other status to show
		const locks = canvas.getAllByRole('img', { name: "Locked: can't be archived" });
		await expect(locks).toHaveLength(1);
		await expect(locks[0].closest('.item')).toHaveTextContent('Scratchpad');
	}}
>
	<div class="w-64 space-y-px sheet-quiet p-2">
		<WorkspaceRow title="Scratchpad" href="#scratch" locked />
		<WorkspaceRow title="Notes" href="#notes" locked working />
		<WorkspaceRow
			title="Release train"
			href="#release"
			locked
			standing={standingOf(checking)}
			actions={actionsFor({ ...checking, locked: true })}
		/>
	</div>
</Story>

<Story name="Inactive" asChild>
	<div class="w-64 space-y-px sheet-quiet p-2">
		<WorkspaceRow title="Active" href="#active" />
		<WorkspaceRow title="Someday" href="#someday" inactive />
		<WorkspaceRow title="Someday, unread" href="#unread" inactive unread />
		<WorkspaceRow title="Someday, on screen" href="#current" inactive current />
	</div>
</Story>

<Story name="A project" asChild>
	<div class="w-64 space-y-px sheet-quiet p-2">
		<WorkspaceRow title="Plan the 0.7 release" icon="icon-[lucide--folder-kanban]" />
		<WorkspaceRow
			title="Bump the protocol"
			href="#child"
			parentHref="#parent"
			parentTitle="Plan the 0.7 release"
			fold={{ count: 1, folded: false, toggle: () => {} }}
		/>
		<div class="ms-3">
			<WorkspaceRow
				title="Pick the release highlights"
				href="#grandchild"
				parentHref="#child"
				parentTitle="Bump the protocol"
			/>
		</div>
	</div>
</Story>

<Story
	name="Workspace activity"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const name of ['Merging pull request', 'Fixing checks', 'Archiving']) {
			const status = canvas.getByRole('img', { name });
			await expect(status).toBeVisible();
			await expect(status.firstElementChild).toHaveClass('icon-[lucide--refresh-cw]');
		}
		await expect(canvas.getAllByRole('img', { name: 'Working' })).toHaveLength(2);
		await expect(canvas.getByRole('img', { name: 'Syncing branch' })).toBeVisible();
		await expect(canvas.queryByRole('img', { name: 'Ready to merge' })).toBeNull();
		await expect(canvas.queryByRole('button')).toBeNull();
	}}
>
	<div class="w-64 sheet-quiet p-2">
		<WorkspaceRow
			title="Branding cleanup"
			progress="merge-pull"
			standing={{ label: 'Ready to merge', tone: 'ok', icon: 'icon-[lucide--circle-check]' }}
			actions={[{ id: 'merge-pull', label: 'Merge PR', icon: 'icon-[lucide--git-merge]' }]}
			onaction={fn()}
		/>
		<WorkspaceRow title="Repair failing CI" progress="fix-checks" />
		<WorkspaceRow title="Retire the old importer" leaving />
		<WorkspaceRow title="Explore the event log" working />
		<WorkspaceRow title="Resolve incoming changes" working progress="merge-upstream" />
		<WorkspaceRow title="Sync a clean branch" progress="merge-upstream" />
	</div>
</Story>

<Story
	name="Running in the background"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const icon = canvas.getByRole('img', { name: '2 running in the background' });
		await expect(icon.closest('a, button')).toBeNull();
		await expect(getComputedStyle(icon).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		// a spinner standing still
		await expect(icon.querySelector('.spinner')).toHaveClass('still');
		// while the agent works, its own spinner says enough
		await expect(canvas.queryByRole('img', { name: '1 running in the background' })).toBeNull();
	}}
>
	<div class="w-64 sheet-quiet p-2">
		<WorkspaceRow title="Watch the build" href="/workspaces/build" background={2} />
		<WorkspaceRow title="Run the tests" href="/workspaces/tests" working background={1} />
	</div>
</Story>

<Story
	name="Open agent question"
	asChild
	play={async ({ canvasElement }) => {
		const link = within(canvasElement).getByRole('link', { name: 'Open agent question' });
		await expect(link).toHaveAttribute('href', '/workspaces/login?question');
		const passive = within(canvasElement).getByRole('img', { name: 'Working' });
		await expect(getComputedStyle(passive).cursor).not.toBe('pointer');
		await expect(passive.closest('a, button')).toBeNull();
		await expect(link).toHaveStyle({ cursor: 'pointer' });
		await expect(getComputedStyle(link).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
		const height = link.getBoundingClientRect().height;
		await expect(link.getBoundingClientRect().width).toBe(height);
		link.focus();
		await waitFor(() => expect(link.getBoundingClientRect().width).toBeGreaterThan(height));
	}}
>
	<div class="w-64 sheet-quiet p-2">
		<WorkspaceRow title="Edit the login form" working />
		<WorkspaceRow title="Choose a page" asking href="/workspaces/login" />
	</div>
</Story>

<Story
	name="Question folded under a row"
	asChild
	play={async ({ canvasElement }) => {
		const link = within(canvasElement).getByRole('link', { name: 'Open agent question' });
		await expect(link).toHaveAttribute('href', '/workspaces/child?question');
	}}
>
	<div class="w-64 sheet-quiet p-2">
		<WorkspaceRow
			title="Plan the release"
			href="/workspaces/parent"
			working
			asking="/workspaces/child"
			fold={{ count: 2, folded: true, toggle: () => {} }}
		/>
	</div>
</Story>

<Story
	name="Checks running with auto-merge enabled"
	asChild
	play={async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByRole('img', {
				name: 'Checks: 1 running, 2 passed · merges automatically'
			})
		).toBeVisible();
	}}
>
	<div class="w-80 sheet-quiet p-2">
		<WorkspaceRow
			title="Chatto 0.6 beta readiness"
			current
			standing={standingOf(checking)}
			actions={actionsFor(checking)}
			onaction={fn()}
		/>
	</div>
</Story>

<Story
	name="Merge while optional checks run"
	asChild
	play={async ({ canvasElement }) => {
		const merge = within(canvasElement).getByRole('button', { name: /Merge PR/ });
		await expect(merge).toHaveAttribute('title', 'Optional checks running');
		await expect(merge).toHaveClass('bg-sunken', 'text-muted');
		await expect(merge).toBeEnabled();
	}}
>
	<div class="w-80 sheet-quiet p-2">
		<WorkspaceRow
			title="Publish widgets"
			current
			standing={standingOf(optionalChecks)}
			actions={actionsFor(optionalChecks)}
			onaction={fn()}
		/>
	</div>
</Story>

<Story
	name="Merge versions"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const merge = canvas.getByRole('button', { name: 'Merge PR — Publish widgets' });
		await expect(merge).toHaveClass('tone-ok');
		const namedPill = canvas.getByRole('link', {
			name: 'Open Changeset for Publish widgets: Widgets 1.3.0'
		});
		await expect(namedPill).toHaveAttribute('href', '/workspaces/widgets?changeset');
		await expect(namedPill).toBeVisible();
		await expect(namedPill.offsetHeight).toBe(merge.offsetHeight);
		await expect(canvas.getByTitle('2.0.1')).toBeVisible();
		merge.focus();
		const name = canvas.getByText('Widgets', { exact: true });
		await expect(name).toBeVisible();
		await expect(getComputedStyle(name).color).not.toBe(
			getComputedStyle(canvas.getByText('1.3.0', { exact: true })).color
		);
		await expect(canvas.getByText('2.0.1', { exact: true })).toBeVisible();
		await expect(canvas.getByTitle('2.0.1')).toHaveTextContent(/^2\.0\.1$/);
	}}
>
	<div class="w-96 sheet-quiet p-2">
		<WorkspaceRow
			title="Publish widgets"
			href="/workspaces/widgets"
			current
			standing={{ label: 'Ready to merge', tone: 'ok', icon: 'icon-[lucide--circle-check]' }}
			actions={[{ id: 'merge-pull', label: 'Merge PR', icon: 'icon-[lucide--git-merge]' }]}
			versions={[
				{ path: 'widgets', name: 'Widgets', version: '1.3.0' },
				{ path: 'api', name: null, version: '2.0.1' }
			]}
			onaction={fn()}
		/>
	</div>
</Story>

<Story
	name="Versions before a pull request"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			canvas.getByRole('link', { name: 'Open Changeset for Add widgets: Widgets 1.3.0' })
		).toBeVisible();
		await expect(canvas.getByRole('img', { name: 'Working' })).toBeVisible();
		await expect(canvas.queryByRole('button', { name: /Merge PR/ })).toBeNull();
	}}
>
	<div class="w-96 sheet-quiet p-2">
		<WorkspaceRow
			title="Add widgets"
			href="/workspaces/widgets"
			working
			versions={[{ path: 'widgets', name: 'Widgets', version: '1.3.0' }]}
		/>
	</div>
</Story>
