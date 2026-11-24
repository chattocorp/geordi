<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ValueBadge from '@geordi/ui/ValueBadge.svelte';

	const { Story } = defineMeta({ title: 'UI/Value badge', component: ValueBadge });
</script>

<Story name="Beside an action" asChild>
	<div class="flex items-center gap-1">
		<ValueBadge label="Widgets" value="1.3.0" />
		<ValueBadge value="2.0.1" />
		<button class="indicator-action tone-ok hover:bg-current/20" aria-label="Merge PR">
			<span class="icon-[lucide--git-merge] size-4 shrink-0"></span>
			Merge PR
		</button>
	</div>
</Story>
