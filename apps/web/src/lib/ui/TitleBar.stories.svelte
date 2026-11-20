<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Badge from '@geordi/ui/Badge.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import TitleBar from '@geordi/ui/TitleBar.svelte';

	const { Story } = defineMeta({ title: 'UI/TitleBar', component: TitleBar });
</script>

<Story name="With a title and actions" asChild>
	<div class="card">
		<TitleBar>
			<h1 class="min-w-0 flex-1 truncate heading">Never look inside submodules</h1>
			<Badge>Idle</Badge>
			<Button variant="ghost" icon="icon-[lucide--archive]" label="Archive" />
		</TitleBar>
		<p class="p-5 text-muted">The page's content</p>
	</div>
</Story>

<Story name="Actions in a narrow workspace" asChild>
	<div class="w-72 sheet">
		<TitleBar>
			<h1 class="truncate heading">Return people after sign-in</h1>
			{#snippet actions()}
				<Button icon="icon-[lucide--git-pull-request]">#412</Button>
				<Button icon="icon-[lucide--git-merge]">Merge PR</Button>
			{/snippet}
		</TitleBar>
	</div>
</Story>

<Story name="Actions above the main pane" asChild>
	<div class="bg-frame">
		<TitleBar contentWidth={480}>
			<div class="min-w-0">
				<h1 class="truncate heading">Return people after sign-in</h1>
				<p class="truncate text-xs text-muted">sample-site</p>
			</div>
			{#snippet actions()}
				<Button icon="icon-[lucide--git-merge]">Merge PR</Button>
			{/snippet}
			{#snippet trailing()}
				<Button variant="ghost" icon="icon-[lucide--panel-right-close]" label="Hide side pane" />
			{/snippet}
		</TitleBar>
		<div class="flex gap-2 px-2 pb-2">
			<div class="h-32 w-120 sheet"></div>
			<div class="flex-1 sheet-quiet"></div>
		</div>
	</div>
</Story>
