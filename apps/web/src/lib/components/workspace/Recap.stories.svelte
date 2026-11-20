<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Recap from './Recap.svelte';
	const { Story } = defineMeta({ title: 'Geordi/Workspace recap', component: Recap });
</script>

<Story
	name="Decision needed"
	args={{
		text: 'The agent fixed the login redirect and verified it in both browsers. It needs your choice of wording for the sign-in button.'
	}}
/>
