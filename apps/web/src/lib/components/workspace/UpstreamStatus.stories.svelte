<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { PullRequest, Upstream } from '@geordi/protocol';
	import UpstreamStatus from './UpstreamStatus.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Upstream status', component: UpstreamStatus });

	const branch: Upstream = {
		forge: 'github',
		repo: 'acme/widgets',
		repoUrl: 'https://github.com/acme/widgets',
		branch: 'geordi/8809aa4e',
		pushed: true,
		createUrl: 'https://github.com/acme/widgets/compare/main...geordi/8809aa4e',
		pull: null
	};
	const pull: PullRequest = {
		number: '42',
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
	const withPull = (overrides: Partial<PullRequest> = {}): Upstream => ({
		...branch,
		pull: { ...pull, ...overrides }
	});
</script>

{#snippet pane(upstream: Upstream)}
	<div class="w-96 overflow-hidden card"><UpstreamStatus {upstream} /></div>
{/snippet}

<Story name="Not pushed" asChild
	>{@render pane({ ...branch, pushed: false, createUrl: null })}</Story
>

<Story name="Pushed, no pull request" asChild>{@render pane(branch)}</Story>

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
