<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from '@geordi/ui/Button.svelte';

	const { Story } = defineMeta({ title: 'UI/Button', component: Button });
</script>

<Story name="Variants" asChild>
	<div class="flex flex-wrap items-center gap-3">
		<Button variant="primary" icon="icon-[lucide--arrow-up]">Start workspace</Button>
		<Button variant="primary">Open issue</Button>
		<Button icon="icon-[lucide--square]">Stop</Button>
		<Button>Secondary</Button>
		<Button variant="ghost">Ghost</Button>
		<span class="rounded-full bg-merged/15 p-1 text-merged"
			><Button variant="soft">Soft</Button></span
		>
		<Button variant="primary" disabled>Disabled</Button>
	</div>
</Story>

<Story name="Busy" asChild>
	<div class="flex flex-wrap items-center gap-3">
		<Button variant="primary" icon="icon-[lucide--git-merge]" busy>Merge PR</Button>
		<Button icon="icon-[lucide--archive]" busy>Archive</Button>
		<Button size="sm" variant="primary" icon="icon-[lucide--wrench]" busy>Fix errors</Button>
	</div>
</Story>

<Story name="Working" asChild>
	<div class="flex flex-wrap items-center gap-3">
		<Button variant="ghost" size="sm" icon="icon-[lucide--play]" working>Run</Button>
		<Button variant="ghost" size="sm" icon="icon-[lucide--square]" working>Stop</Button>
	</div>
</Story>

<Story name="Icon only" asChild>
	<div class="flex flex-wrap items-center gap-3">
		<Button variant="primary" icon="icon-[lucide--arrow-up]" label="Send" />
		<Button icon="icon-[lucide--refresh-cw]" label="Refresh" />
		<Button variant="ghost" icon="icon-[lucide--moon]" label="Switch to dark mode" />
		<Button variant="ghost" size="sm" icon="icon-[lucide--plus]" label="New window" />
		<Button variant="ghost" size="sm" icon="icon-[lucide--x]" label="Close" />
	</div>
</Story>

<Story name="Small" asChild>
	<div class="flex flex-wrap items-center gap-3">
		<Button size="sm" variant="primary">Primary</Button>
		<Button size="sm">Secondary</Button>
		<Button size="sm" variant="ghost">Close</Button>
	</div>
</Story>
