<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DesktopUpdates from './DesktopUpdates.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/Settings/Desktop updates',
		component: DesktopUpdates,
		args: { controls: { check() {}, restart() {}, setBeta() {} } }
	});
</script>

<Story
	name="Stable"
	args={{ state: { beta: false, status: 'current', ready: null, busy: false } }}
/>
<Story
	name="Beta ready to install"
	args={{ state: { beta: true, status: 'ready', ready: '0.5.0-beta.1', busy: false } }}
/>
