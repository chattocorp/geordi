<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Badge from './Badge.svelte';
	import Spinner from './Spinner.svelte';

	const { Story } = defineMeta({ title: 'UI/Spinner', component: Spinner });
</script>

<!--
	For things at work. All spinners on a page turn together. In the colour of the text
	around it; `live` (gold) is for the one place that says which agents are at work.
-->
<Story name="At work" asChild>
	<div class="flex items-center gap-6 text-sm">
		<Spinner />
		<span class="flex items-center gap-2 text-muted"><Spinner /> Loading…</span>
		<span class="flex items-center gap-2"><Spinner live /> Fix the flaky test</span>
		<Badge tone="accent"><Spinner /> Working</Badge>
	</div>
</Story>
