<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DesktopUpdates from './DesktopUpdates.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/Settings/Desktop updates',
		component: DesktopUpdates,
		args: { controls: { check() {}, restart() {}, setChannel() {} } }
	});
</script>

<Story
	name="Stable"
	args={{ state: { channel: 'latest', status: 'current', ready: null, busy: false } }}
/>
<Story
	name="Beta ready to install"
	args={{ state: { channel: 'beta', status: 'ready', ready: '0.5.0-beta.1', busy: false } }}
/>
<Story
	name="Alpha"
	args={{ state: { channel: 'alpha', status: 'current', ready: null, busy: false } }}
/>
