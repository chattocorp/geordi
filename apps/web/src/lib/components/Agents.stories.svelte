<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { Agent } from '@geordi/protocol';
	import AgentAvatar from './AgentAvatar.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import AgentPicker from './workspace/AgentPicker.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Agents' });
</script>

<script lang="ts">
	let agent = $state<Agent>('claude');
</script>

<Story name="Avatar and status" asChild>
	<div class="flex flex-wrap items-center gap-4">
		<AgentAvatar agent="claude" />
		<AgentAvatar agent="codex" />
		<AgentAvatar agent="claude" size="sm" />
		<AgentAvatar agent="codex" size="sm" />
		<StatusBadge running />
		<StatusBadge running={false} />
	</div>
</Story>

<Story name="Picker" asChild>
	<AgentPicker bind:value={agent} />
</Story>
