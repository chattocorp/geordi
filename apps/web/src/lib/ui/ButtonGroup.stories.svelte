<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from '@geordi/ui/Button.svelte';
	import ButtonGroup from '@geordi/ui/ButtonGroup.svelte';

	const { Story } = defineMeta({ title: 'UI/Button group', component: ButtonGroup });
</script>

<Story name="Secondary and primary" asChild>
	<ButtonGroup label="Next steps">
		<Button icon="icon-[lucide--git-merge]">Sync</Button>
		<Button variant="primary" icon="icon-[lucide--check]">Merge PR</Button>
	</ButtonGroup>
</Story>

<Story name="Small, in something coloured" asChild>
	<div class="inline-flex items-center gap-2 rounded-full bg-ok/12 py-1 pr-1 pl-3 text-ok">
		<span class="text-sm font-medium">Ready to merge</span>
		<ButtonGroup label="Next steps">
			<Button size="sm" variant="soft" icon="icon-[lucide--git-merge]">Sync</Button>
			<Button size="sm" variant="primary" tone="ok" icon="icon-[lucide--check]">Merge PR</Button>
		</ButtonGroup>
	</div>
</Story>
