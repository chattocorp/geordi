<script lang="ts">
	import Settings from '#lib/components/Settings.svelte';
	import { settings } from '#lib/components/settings.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// opening the settings again comes back here
	$effect(() => {
		settings.section = data.section;
	});
</script>

<Settings section={data.section} />
