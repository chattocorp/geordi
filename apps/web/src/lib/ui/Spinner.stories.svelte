<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Spinner from '@geordi/ui/Spinner.svelte';

	const { Story } = defineMeta({ title: 'UI/Spinner', component: Spinner });
</script>

<Story name="At work" asChild>
	<div class="flex items-center gap-6 text-sm">
		<Spinner />
		<span class="flex items-center gap-2 text-muted"><Spinner /> Agent thinking…</span>
		<span class="flex items-center gap-2">
			<span class="grid size-5 place-items-center text-muted"><Spinner /></span> Fix the flaky test
		</span>
	</div>
</Story>

<Story name="Background tasks" asChild>
	<div class="flex items-center gap-6 text-sm">
		<Spinner still />
		<span class="flex items-center gap-2 text-muted">
			<Spinner still label="Background tasks running" /> Waiting on background tasks
		</span>
	</div>
</Story>
