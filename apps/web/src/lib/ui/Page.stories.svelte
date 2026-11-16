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
