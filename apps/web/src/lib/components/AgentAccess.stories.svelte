<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AgentAccess from './AgentAccess.svelte';
	const { Story } = defineMeta({ title: 'Geordi/Agent access', component: AgentAccess });
</script>

<Story
	name="Repository access"
	args={{
		repos: [
			{ id: 'geordi', name: 'geordi' },
			{ id: 'website', name: 'website' },
			{ id: 'dotfiles', name: 'dotfiles' }
		],
		grants: [{ id: 'example', name: 'Release assistant', repoIds: ['geordi', 'website'] }],
		issue: async () => 'example-token',
		revoke: async () => {}
	}}
/>

<Story
	name="No repositories"
	args={{ repos: [], grants: [], issue: async () => 'example-token', revoke: async () => {} }}
/>
