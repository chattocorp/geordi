<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Family from './Family.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Family', component: Family });

	const parent = { id: 'p', title: 'Speed up the test suite', status: 'running' } as const;
</script>

<Story name="A child" asChild>
	<div class="overflow-hidden card"><Family {parent} /></div>
</Story>

<Story name="Sharing the parent's directory" asChild>
	<div class="overflow-hidden card"><Family {parent} sharesWorktree /></div>
</Story>
