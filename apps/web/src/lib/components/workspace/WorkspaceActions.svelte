<script lang="ts">
	import type { WorkspaceAction } from '#lib/actions.ts';
	import Button from '#lib/ui/Button.svelte';

	type Props = {
		/** What could happen next, the most pressing first. */
		actions: WorkspaceAction[];
		/** The actions already under way: asked of the agent and not done yet. */
		pending?: WorkspaceAction['id'][];
		onaction(action: WorkspaceAction): void;
	};
	let { actions, pending = [], onaction }: Props = $props();
</script>

<!-- The first action is the next step; the others are possible too. -->
<div class="flex shrink-0 items-center gap-2" role="group" aria-label="Next steps">
	{#each actions as action, index (action.id)}
		<Button
			variant={index === 0 ? 'primary' : 'secondary'}
			icon={action.icon}
			disabled={pending.includes(action.id)}
			onclick={() => onaction(action)}
		>
			{action.label}
		</Button>
	{/each}
</div>
