<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Page from './Page.svelte';

	const { Story } = defineMeta({ title: 'UI/Page', component: Page });
</script>

<Story name="With a description" asChild>
	<Page title="Repositories">
		{#snippet description()}What needs doing, and what has been done.{/snippet}
		<div class="card p-4">The page's content</div>
	</Page>
</Story>

<Story name="Wide" asChild>
	<Page title="New workspace" wide>
		<div class="card p-4">The page content uses the wider column.</div>
	</Page>
</Story>
