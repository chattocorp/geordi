<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import WaitingForView from './WaitingForView.svelte';
	const { Story } = defineMeta({ title: 'Geordi/WaitingForView', component: WaitingForView });
</script>

<Story name="Loading" args={{ lost: false }} />
<Story name="Reconnecting" args={{ lost: true }} />
