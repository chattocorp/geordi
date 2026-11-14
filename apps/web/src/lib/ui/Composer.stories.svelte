<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import Composer from './Composer.svelte';

	const { Story } = defineMeta({ title: 'UI/Composer', component: Composer });

	const form = { onsubmit: (event: SubmitEvent) => event.preventDefault() };
</script>

<Story name="Prompt" asChild>
	<div class="max-w-2xl">
		<Composer {form} label="New workspace" placeholder="What should the agent do?">
			{#snippet footer()}
				<Button type="submit" variant="primary" icon="icon-[lucide--arrow-up]" class="ml-auto">
					Start workspace
				</Button>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story name="Reply" asChild>
	<div class="max-w-2xl">
		<Composer {form} rows={2} placeholder="Reply to the agent">
			{#snippet footer()}
				<p class="pl-1 text-xs text-muted">Enter to send, Shift+Enter for a new line</p>
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story name="Busy, with a problem" asChild>
	<div class="max-w-2xl">
		<Composer
			{form}
			rows={2}
			placeholder="The agent is working…"
			disabled
			problems={['Write something first']}
		>
			{#snippet footer()}
				<Button icon="icon-[lucide--square]" class="ml-auto">Stop</Button>
			{/snippet}
		</Composer>
	</div>
</Story>
