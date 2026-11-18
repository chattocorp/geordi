<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ConnectionIndicator from './ConnectionIndicator.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/ConnectionIndicator',
		component: ConnectionIndicator
	});
</script>

<Story name="Connected" args={{ lost: false }} />
<Story name="Reconnecting" args={{ lost: true }} />
