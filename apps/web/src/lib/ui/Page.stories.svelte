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
	<Page title="Overview" wide>
		<div class="grid grid-cols-2 gap-4">
			<div class="card p-4">One</div>
			<div class="card p-4">Two</div>
		</div>
	</Page>
</Story>
