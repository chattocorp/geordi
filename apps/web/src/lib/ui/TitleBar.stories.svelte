<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import TitleBar from './TitleBar.svelte';

	const { Story } = defineMeta({ title: 'UI/TitleBar', component: TitleBar });
</script>

<Story name="With a title and actions" asChild>
	<div class="card">
		<TitleBar class="border-b border-line">
			<h1 class="min-w-0 flex-1 truncate heading">Never look inside submodules</h1>
			<Badge>Idle</Badge>
			<Button variant="ghost" icon="icon-[lucide--archive]" label="Archive" />
		</TitleBar>
		<p class="p-5 text-muted">The page's content</p>
	</div>
</Story>
