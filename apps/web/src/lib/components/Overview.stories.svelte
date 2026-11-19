<script module lang="ts">
	import { expect, userEvent, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { PullRequest, Upstream } from '@geordi/protocol';
	import { actionsFor, standingOf } from '#lib/actions.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import Overview from './Overview.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Overview', component: Overview });

	type Item = Navigation['workspaces'][number];
	type State = Parameters<typeof actionsFor>[0];

	const file = { path: 'a.txt', status: 'modified' as const, added: 1, removed: 0 };
	const pushed = { files: [file], uncommitted: 0, unpushed: 0 };
	const dirty = { files: [file], uncommitted: 2, unpushed: 0 };
	const failing = { state: 'failure', total: 6, failed: 1, url: null } as const;
	const running = { state: 'pending', total: 6, failed: 0, url: null } as const;

	let pulls = 140;
	const upstream = (pull: Partial<PullRequest> | null): Upstream => ({
		forge: 'github',
		repo: 'acme/geordi',
		repoUrl: null,
		branch: 'geordi/abc',
		pushed: true,
		createUrl: null,
		pull: pull && {
			number: String(pulls++),
			title: 'A change',
			url: null,
			state: 'open',
			draft: false,
			base: 'main',
			checks: { state: 'success', total: 6, failed: 0, url: null },
			review: null,
			...pull
		}
	});

	const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

	/** A workspace as the navigation view has it, its ribbon made from how its work stands. */
	const workspace = (
		id: string,
		title: string,
		state: State,
		rest: Partial<Item> & { minutes?: number } = {}
	): Item => {
		const { minutes = 30, ...item } = rest;
		const pull = state.upstream?.pull;
		return {
			id,
			title,
			repoId: 'geordi',
			parentId: null,
			status: 'idle',
			working: false,
			outcome: 'completed',
			standing: standingOf(state),
			actions: actionsFor(state),
			branch: `geordi/${id}`,
			pull: pull ? { number: pull.number, url: pull.url } : null,
			updatedAt: minutesAgo(minutes),
			...item
		};
	};
	const working = { status: 'running', working: true, outcome: null } as const;

	const repo = (id: string, name: string) => ({
		id,
		name,
		path: `/code/${id}`,
		registeredAt: '2026-11-14T09:00:00.000Z',
		workspaceCount: 1,
		working: 0
	});

	/** A day's work: something in every lane, and the ribbons each can show. */
	const busy: Navigation = {
		access: [],
		repos: [repo('geordi', 'geordi'), repo('site', 'website')],
		workspaces: [
			// needs you
			workspace(
				'asking',
				'Choose a storage engine',
				{ changes: dirty, upstream: upstream(null) },
				{ ...working, outcome: 'asking', minutes: 2 }
			),
			workspace(
				'failing',
				'Guard shared worktrees from update and continue',
				{ changes: pushed, upstream: upstream({ checks: failing }) },
				{ minutes: 12 }
			),
			workspace('failed', 'Migrate the event log to WAL mode', {
				changes: dirty,
				upstream: upstream(null),
				failed: true
			}),
			// at work
			workspace(
				'conflicts',
				'Multiple PRs per workspace',
				{ changes: pushed, upstream: upstream({ conflicts: true }) },
				{ ...working, minutes: 0 }
			),
			workspace(
				'fresh',
				"Run the daemon's git without blocking",
				{ changes: { files: [], uncommitted: 0, unpushed: 0 }, upstream: upstream(null) },
				{ ...working, minutes: 1 }
			),
			workspace(
				'writing',
				'Inline Mermaid and SVG in Markdown',
				{ changes: dirty, upstream: upstream(null) },
				{ ...working, repoId: 'site', minutes: 4 }
			),
			// a project (FDR-012): no repository, no changes
			workspace(
				'project',
				'Ship the protocol bump everywhere',
				{ changes: null, upstream: null },
				{ ...working, repoId: null, branch: null, minutes: 2 }
			),
			// open
			workspace(
				'ready',
				'Raise light mode text contrast',
				{ changes: pushed, upstream: upstream({ review: 'approved' }) },
				{ minutes: 45 }
			),
			workspace(
				'checks',
				'Electron auto-updates',
				{ changes: pushed, upstream: upstream({ checks: running }) },
				{ minutes: 50 }
			),
			workspace(
				'draft',
				'External agent access over MCP',
				{ changes: pushed, upstream: upstream({ draft: true }) },
				{ minutes: 180 }
			),
			workspace(
				'unpushed',
				'Chatto 0.5 blog post',
				{ changes: dirty, upstream: upstream(null) },
				{ repoId: 'site', minutes: 60 * 26 }
			),
			// done
			workspace(
				'merged',
				'Run checks, lint and tests in CI',
				{ changes: pushed, upstream: upstream({ state: 'merged' }) },
				{ minutes: 60 * 5 }
			),
			workspace(
				'closed',
				'Try out a second sidebar',
				{ changes: pushed, upstream: upstream({ state: 'closed' }) },
				{ minutes: 60 * 50 }
			)
		],
		harnesses: null
	};
</script>

{#snippet frame(nav: Navigation | undefined, lost = false)}
	<!-- as the layout holds a page: a column in the frame, as tall as the window -->
	<div class="flex min-h-dvh flex-col bg-frame">
		<Overview {nav} {lost} />
	</div>
{/snippet}

<Story
	name="A busy day"
	asChild
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const heading of ['Needs you', 'At work', 'Open', 'Done'])
			await expect(canvas.getByRole('button', { name: new RegExp(heading) })).toBeVisible();

		// a section folds away under its heading, saying how much is in it, and back
		const done = canvas.getByRole('button', { name: /Done/ });
		await userEvent.click(done);
		await expect(done).toHaveAttribute('aria-expanded', 'false');
		await expect(done).toHaveTextContent('2');
		await expect(canvas.queryByText('Try out a second sidebar')).toBeNull();
		await userEvent.click(done);
		await expect(canvas.getByText('Try out a second sidebar')).toBeVisible();

		// every ribbon stays inside its card
		for (const card of canvasElement.querySelectorAll('li')) {
			const edge = card.getBoundingClientRect().right;
			for (const group of within(card as HTMLElement).queryAllByRole('group', {
				name: 'Next steps'
			}))
				await expect(group.getBoundingClientRect().right).toBeLessThanOrEqual(edge);
		}
	}}
>
	{@render frame(busy)}
</Story>

<Story name="Nothing going on" asChild>
	{@render frame({ ...busy, workspaces: [] })}
</Story>

<Story name="Waiting for the forge" asChild>
	{@render frame(undefined)}
</Story>

<Story name="Connection lost" asChild>
	{@render frame(undefined, true)}
</Story>
