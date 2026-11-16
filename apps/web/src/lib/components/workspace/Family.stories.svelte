<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Family from './Family.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Family', component: Family });

	const parent = { id: 'p', title: 'Speed up the test suite', status: 'running' } as const;
	const children = [
		{ id: 'a', title: 'Find the slowest tests', status: 'idle' },
		{ id: 'b', title: 'Review the changes to the fixtures for anything risky', status: 'running' }
	] as const;
</script>

<Story name="A child" asChild>
	<div class="overflow-hidden card"><Family {parent} children={[]} /></div>
</Story>

<Story name="A parent" asChild>
	<div class="overflow-hidden card"><Family parent={null} children={[...children]} /></div>
</Story>

<Story name="Both, sharing the parent's directory" asChild>
	<div class="overflow-hidden card">
		<Family {parent} sharesWorktree children={[...children]} />
	</div>
</Story>
