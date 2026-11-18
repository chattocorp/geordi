<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { PullRequest } from '@geordi/protocol';
	import PullRequestPane from './PullRequestPane.svelte';

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
	<div class="w-96 sheet"><PullRequestPane {pull} /></div>
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
