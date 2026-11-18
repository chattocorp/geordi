<script module lang="ts">
	import { expect } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { PullRequest } from '@geordi/protocol';
	import PullRequestPane from './PullRequestPane.svelte';
	import PullRequestTab from './PullRequestTab.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Pull request', component: PullRequestPane });

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
		<PullRequestPane {pull} />
	</div>
{/snippet}

<Story name="Ready to merge" asChild>{@render pane(withPull())}</Story>

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

<Story name="Checks under way" asChild>
	{@render pane(
		withPull({
			checks: {
				state: 'pending',
				total: 17,
				failed: 0,
				counts: { passed: 5, failed: 0, pending: 8, skipped: 4 },
				url: 'https://github.com/acme/widgets/pull/42/checks'
			},
			review: null
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
		/>
	</div>
</Story>
