<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Segmented from './Segmented.svelte';

	const { Story } = defineMeta({ title: 'UI/Segmented', component: Segmented });

	let value = $state('system');
</script>

<Story name="Choices" asChild>
	<Segmented
		label="Theme"
		bind:value
		options={[
			{ value: 'system', label: 'System', icon: 'icon-[lucide--monitor]' },
			{ value: 'light', label: 'Light', icon: 'icon-[lucide--sun]' },
			{ value: 'dark', label: 'Dark', icon: 'icon-[lucide--moon]' }
		]}
	/>
</Story>
