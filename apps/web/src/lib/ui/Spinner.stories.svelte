<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Badge from './Badge.svelte';
	import Spinner from '@geordi/ui/Spinner.svelte';

	const { Story } = defineMeta({ title: 'UI/Spinner', component: Spinner });
</script>

<Story name="At work" asChild>
	<div class="flex items-center gap-6 text-sm">
		<Spinner />
		<span class="flex items-center gap-2 text-muted"><Spinner /> Loading…</span>
		<span class="flex items-center gap-2"
			><span class="grid size-5 place-items-center text-muted/80"><Spinner /></span> Fix the flaky test</span
		>
		<Badge tone="accent"><Spinner /> Working</Badge>
	</div>
</Story>
