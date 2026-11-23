<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Loading from '@geordi/ui/Loading.svelte';

	const { Story } = defineMeta({ title: 'UI/Loading', component: Loading });
</script>

<Story name="In a pane" asChild>
	<div class="flex h-80 w-96 flex-col sheet">
		<Loading label="Loading the changes…" />
	</div>
</Story>
