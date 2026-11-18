<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { singleGroup } from '#lib/layout.ts';
	import Panes from '#lib/ui/Panes.svelte';
	import ConversationTab from './ConversationTab.svelte';

	const { Story } = defineMeta({
		title: 'Workspace/Conversation tabs',
		component: ConversationTab
	});
</script>

<Story name="Working" asChild>
	<div class="flex sheet overflow-hidden">
		<Panes layout={singleGroup(['chat', 'aide'])} onchange={() => {}}>
			{#snippet tab(id)}
				{#if id === 'chat'}
					<ConversationTab agent="codex" running />
				{:else}
					<ConversationTab agent="claude" title="Review" running={false} />
				{/if}
			{/snippet}
			{#snippet window()}{/snippet}
		</Panes>
	</div>
</Story>
