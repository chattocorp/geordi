<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import RepositoryThreads from './RepositoryThreads.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/Repository threads',
		component: RepositoryThreads
	});
	const issue = {
		number: '42',
		title: 'Keep the last terminal row visible',
		url: 'https://github.com/acme/forge/issues/42',
		author: 'alex',
		updatedAt: '2026-11-19T08:00:00Z',
		draft: false,
		review: null
	};
</script>

<Story
	name="Start from an issue"
	args={{ repo: 'forge', issues: true, items: [issue], workspaces: [] }}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const link = canvas.getByRole('link', { name: 'Start workspace' }) as HTMLAnchorElement;
		const { searchParams } = new URL(link.href);
		await expect(searchParams.get('repo')).toBe('forge');
		await expect(searchParams.get('issue')).toBe(issue.url);
		await expect(searchParams.get('title')).toBe(issue.title);
	}}
/>
<Story
	name="Open pull requests"
	args={{
		repo: 'forge',
		issues: false,
		items: [{ ...issue, url: 'https://github.com/acme/forge/pull/42', review: 'approved' }],
		workspaces: [
			{
				id: 'terminal-row',
				repoId: 'forge',
				pull: { number: '42', url: 'https://github.com/acme/forge/pull/42' }
			}
		]
	}}
	play={async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByRole('link', { name: 'Open workspace' })
		).toHaveAttribute('href', '/workspaces/terminal-row');
	}}
/>
<Story name="No open issues" args={{ repo: 'forge', issues: true, items: [], workspaces: [] }} />

<Story
	name="Issue cards"
	args={{
		repo: 'forge',
		issues: true,
		workspaces: [],
		items: [
			issue,
			{
				...issue,
				number: '51',
				title: 'Restore the focused terminal when returning to a workspace',
				url: 'https://github.com/acme/forge/issues/51',
				author: 'sam'
			}
		]
	}}
/>
