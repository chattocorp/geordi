<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PalettePicker from './PalettePicker.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/Settings/Palette picker',
		component: PalettePicker
	});
</script>

<Story name="Workspace previews" args={{ value: 'Geordi' }} />
