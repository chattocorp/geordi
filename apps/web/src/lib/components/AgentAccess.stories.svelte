<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AgentAccess from './AgentAccess.svelte';
	const { Story } = defineMeta({ title: 'Geordi/Agent access', component: AgentAccess });
</script>

<Story
	name="Repository access"
	args={{
		repos: [{ id: 'geordi', name: 'Geordi' }],
		grants: [{ id: 'example', name: 'Release assistant', repoId: 'geordi' }],
		issue: async () => 'example-token',
		revoke: async () => {}
	}}
/>
