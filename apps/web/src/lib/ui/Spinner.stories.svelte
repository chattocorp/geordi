<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Badge from './Badge.svelte';
	import Spinner from './Spinner.svelte';

	const { Story } = defineMeta({ title: 'UI/Spinner', component: Spinner });
</script>

<!-- For agents at work. All spinners on a page turn together. -->
<Story name="At work" asChild>
	<div class="flex items-center gap-6 text-sm">
		<Spinner />
		<span class="flex items-center gap-2"><Spinner /> Fix the flaky test</span>
		<Badge tone="accent"><Spinner /> Working</Badge>
	</div>
</Story>
