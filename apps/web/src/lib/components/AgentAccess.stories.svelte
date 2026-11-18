<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AgentAccess from './AgentAccess.svelte';
	const { Story } = defineMeta({ title: 'Geordi/Agent access', component: AgentAccess });
</script>

<Story
	name="Installation access"
	args={{
		grants: [{ id: 'example', name: 'Release assistant' }],
		issue: async () => 'example-token',
		revoke: async () => {}
	}}
/>
