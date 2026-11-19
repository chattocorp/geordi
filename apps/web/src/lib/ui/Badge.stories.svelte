<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Badge from '@geordi/ui/Badge.svelte';

	const { Story } = defineMeta({ title: 'UI/Badge', component: Badge });
</script>

<Story name="Tones" asChild>
	<div class="flex flex-wrap items-center gap-3">
		<Badge>3 workspaces</Badge>
		<Badge tone="accent">2</Badge>
		<Badge dot>Idle</Badge>
		<Badge tone="accent" dot>Working</Badge>
	</div>
</Story>
