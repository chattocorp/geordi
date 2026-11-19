<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Ring from '@geordi/ui/Ring.svelte';

	const { Story } = defineMeta({ title: 'UI/Ring', component: Ring });
</script>

<Story name="Checks under way" asChild>
	<div class="flex items-center gap-4">
		<Ring
			label="19 running, 18 passed, 2 skipped"
			parts={[
				{ size: 18, tone: 'ok' },
				{ size: 2, tone: 'neutral' },
				{ size: 19, tone: 'accent' }
			]}
		/>
		<Ring
			label="1 failed, 3 running"
			parts={[
				{ size: 1, tone: 'danger' },
				{ size: 3, tone: 'accent' }
			]}
		/>
		<Ring label="Nothing yet" parts={[]} />
	</div>
</Story>

<Story name="Part of a whole" asChild>
	<div class="flex items-center gap-4">
		<Ring
			label="A third used"
			parts={[
				{ size: 1, tone: 'muted' },
				{ size: 2, tone: 'empty' }
			]}
		/>
		<Ring
			label="Nearly full"
			parts={[
				{ size: 19, tone: 'danger' },
				{ size: 1, tone: 'empty' }
			]}
		/>
	</div>
</Story>
