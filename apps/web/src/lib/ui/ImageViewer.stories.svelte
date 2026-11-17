<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ImageViewer from './ImageViewer.svelte';

	const { Story } = defineMeta({ title: 'UI/ImageViewer', component: ImageViewer });

	const picture =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#c9a227"/><circle cx="400" cy="250" r="140" fill="#2c2f3b"/></svg>'
		);
	let open = $state(true);
</script>

<Story name="Open" asChild>
	<button type="button" onclick={() => (open = true)}>
		<img src={picture} alt="An example" class="h-24 rounded-control" />
	</button>
	{#if open}<ImageViewer src={picture} alt="An example" onclose={() => (open = false)} />{/if}
</Story>
