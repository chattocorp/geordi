<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RepoPicker from './RepoPicker.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Repository picker', component: RepoPicker });
	const repos = [
		{ id: 'geordi', name: 'Geordi' },
		{ id: 'sample', name: 'Sample project' }
	];
</script>

<Story name="Repository choices" asChild>
	<RepoPicker {repos} value="geordi" open />
</Story>
