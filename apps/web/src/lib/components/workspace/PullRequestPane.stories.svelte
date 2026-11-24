<script module lang="ts">
	import { expect } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { PullRequest } from '@geordi/protocol';
	import Markdown from '#lib/components/Markdown.svelte';
	import PullRequestPane from '@geordi/ui/PullRequestPane.svelte';
	import PullRequestTab from '@geordi/ui/PullRequestTab.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Pull request', component: PullRequestPane });

	function resetChecksPreference() {
		localStorage.removeItem('geordi:checks-expanded');
	}

	const pull: PullRequest = {
		number: '42',
		body: 'Keep workspace diffs fast by skipping submodule contents.\n\n- Show changes to the recorded commit.\n- Leave nested working trees alone.',
		title: 'Never look inside submodules when diffing a workspace',
		url: 'https://github.com/acme/widgets/pull/42',
		state: 'open',
		draft: false,
		base: 'main',
		checks: {
			state: 'success',
			total: 18,
			failed: 0,
			counts: { passed: 14, failed: 0, pending: 0, skipped: 4 },
			url: 'https://github.com/acme/widgets/pull/42/checks'
		},
		review: 'approved'
	};
	const withPull = (overrides: Partial<PullRequest> = {}) => ({ ...pull, ...overrides });
</script>

{#snippet pane(pull: PullRequest)}
	<div class="w-96 sheet">
		<div class="pane-bar px-2">
			<span class="flex items-center gap-2 tab-active px-2 py-1"><PullRequestTab {pull} /></span>
		</div>
		<PullRequestPane {pull}>
			{#snippet description(text: string)}<Markdown {text} />{/snippet}
		</PullRequestPane>
	</div>
{/snippet}

<Story name="Ready to merge" asChild>{@render pane(withPull())}</Story>

<Story name="One passed check" asChild>
	{@render pane(
		withPull({
			checks: {
				state: 'success',
				total: 1,
				failed: 0,
				items: [{ id: 'test', name: 'Tests', state: 'success', status: 'success' }],
				url: null
			}
		})
	)}
</Story>

<Story name="Checks failing, changes requested" asChild>
	{@render pane(
		withPull({
			checks: {
				state: 'failure',
				total: 18,
				failed: 2,
				counts: { passed: 9, failed: 2, pending: 3, skipped: 4 },
				url: null
			},
			review: 'changes_requested'
		})
	)}
</Story>

<Story
	name="Checks under way"
	beforeEach={resetChecksPreference}
	asChild
	play={async ({ canvas, userEvent }) => {
		const summary = canvas.getByRole('button', { name: /^Checks 6/ });
		await expect(summary).toHaveAttribute('aria-expanded', 'false');
		await userEvent.click(canvas.getByRole('img', { name: /1 queued/ }));
		const browser = canvas.getByRole('link', { name: /^Browser tests Running/ });
		await expect(browser).toBeVisible();
		await expect(canvas.getAllByRole('listitem')[0]).toHaveTextContent('Unit tests');
		await expect(canvas.getByText('Lint')).toBeVisible();
		await userEvent.click(summary);
		await expect(browser).not.toBeVisible();
		await expect(localStorage.getItem('geordi:checks-expanded')).toBe('false');
		await userEvent.click(summary);
		await expect(canvas.getByText('2m 14s')).toBeVisible();
		await expect(localStorage.getItem('geordi:checks-expanded')).toBe('true');
	}}
>
	{@render pane(
		withPull({
			checks: {
				state: 'failure',
				total: 6,
				failed: 1,
				counts: { passed: 2, failed: 1, pending: 2, skipped: 1 },
				items: [
					{
						id: 'lint',
						name: 'Lint',
						state: 'success',
						status: 'success',
						startedAt: 1000,
						completedAt: 135000
					},
					{
						id: 'browser',
						name: 'Browser tests',
						state: 'pending',
						status: 'in_progress',
						startedAt: Date.now() - 45000,
						url: 'https://github.com/acme/widgets/actions/runs/123'
					},
					{
						id: 'test',
						name: 'Unit tests',
						state: 'failure',
						status: 'failure',
						startedAt: 1000,
						completedAt: 20000,
						url: 'https://github.com/acme/widgets/actions/runs/124'
					},
					{ id: 'preview', name: 'Deploy preview', state: 'pending', status: 'queued' },
					{ id: 'types', name: 'Type check', state: 'success', status: 'success' },
					{ id: 'docs', name: 'Build docs', state: 'neutral', status: 'skipped' }
				],
				url: 'https://github.com/acme/widgets/pull/42/checks'
			},
			review: null
		})
	)}
</Story>

<Story
	name="Many running checks"
	beforeEach={resetChecksPreference}
	asChild
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: /^Checks 37/ }));
		const list = canvas.getByRole('region', { name: 'Checks' }).querySelector('ul')!;
		await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
		await expect(list.firstElementChild).toHaveTextContent(/\d+[smh]$/);
		list.scrollTop = list.scrollHeight;
		await expect(list.scrollTop).toBeGreaterThan(0);
		list.scrollTop = 0;
	}}
>
	{@render pane(
		withPull({
			checks: {
				state: 'pending',
				total: 37,
				failed: 0,
				url: pull.checks!.url,
				counts: { passed: 4, failed: 0, pending: 33, skipped: 0 },
				items: Array.from({ length: 37 }, (_, index) => ({
					id: String(index),
					name: `Integration tests (${index + 1}/37)`,
					state: index < 33 ? 'pending' : 'success',
					status: index < 33 ? 'in_progress' : 'success',
					startedAt: Date.now() - (134 + index) * 1000
				}))
			}
		})
	)}
</Story>

<Story name="Draft, checks running" asChild>
	{@render pane(
		withPull({
			draft: true,
			checks: { state: 'pending', total: null, failed: null, url: null },
			review: 'pending'
		})
	)}
</Story>

<Story name="Merged" asChild>
	{@render pane(withPull({ state: 'merged', checks: null, review: null }))}
</Story>

<Story
	name="Long URL in a narrow pane"
	asChild
	play={async ({ canvas }) => {
		const pane = canvas.getByRole('region', { name: 'Pull request' });
		await expect(pane.scrollWidth).toBeLessThanOrEqual(pane.clientWidth);
	}}
>
	<div class="w-64 sheet">
		<PullRequestPane
			pull={withPull({
				body: 'Build report: https://example.test/' + 'a'.repeat(180),
				checks: null,
				review: null
			})}
		>
			{#snippet description(text: string)}<Markdown {text} />{/snippet}
		</PullRequestPane>
	</div>
</Story>
