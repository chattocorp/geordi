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

<Story name="While the agent works" asChild>
	<div class="max-w-2xl">
		<Composer {form} live rows={2} placeholder="Steer the agent, or queue a message">
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

<Story name="While the agent works, tall prompt" asChild>
	<div class="max-w-2xl">
		<Composer {form} live rows={6} placeholder="Steer the agent, or queue a message">
			{#snippet footer()}
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

<Story name="With attachments" asChild>
	<div class="max-w-2xl">
		<Composer {form} placeholder="Describe this image">
			{#snippet attachments()}
				<div class="px-4 py-2">
					<img
						src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
						alt="Screenshot attachment"
						class="size-20 rounded-control bg-sunken object-contain"
					/>
				</div>
			{/snippet}
			{#snippet footer()}
				<Button type="button" variant="ghost" icon="icon-[lucide--image-plus]" label="Add images" />
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
