<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Notice from './Notice.svelte';

	const { Story } = defineMeta({ title: 'UI/Notice', component: Notice });
</script>

<Story name="Error" asChild>
	<div class="max-w-xl"><Notice>claude exited with code 1: not logged in</Notice></div>
</Story>
