<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { Harness } from '@geordi/protocol';
	import Providers from './Providers.svelte';
	import AgentAvatar from '@geordi/ui/AgentAvatar.svelte';
	import HarnessPicker, { type HarnessChoice } from './workspace/HarnessPicker.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Agents' });

	const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
	const harnesses: Harness[] = [
		{
			agent: 'claude',
			models: ['Fable', 'Opus', 'Sonnet'].map((name) => ({
				id: name.toLowerCase(),
				name,
				efforts
			})),
			efforts
		},
		// a CLI that says nothing about its models: there is nothing to choose
		{ agent: 'codex', models: [], efforts: [] },
		{ agent: 'opencode', models: [], efforts: [] }
	];
</script>

<script lang="ts">
	let choice = $state<HarnessChoice>({
		agent: 'claude',
		settings: { claude: { model: 'opus', effort: 'high', permissionMode: 'auto' } }
	});
</script>

<Story name="Avatars" asChild>
	<div class="flex flex-wrap items-center gap-4">
		<AgentAvatar agent="claude" />
		<AgentAvatar agent="codex" />
		<AgentAvatar agent="opencode" />
		<AgentAvatar agent="claude" size="sm" />
		<AgentAvatar agent="codex" size="sm" />
	</div>
</Story>

<Story name="Picker" asChild>
	<HarnessPicker {harnesses} {choice} onchange={(next) => (choice = next)} />
</Story>

<Story name="Provider status" asChild>
	<Providers harnesses={[harnesses[0]]} active={['claude']} />
</Story>

<Story name="Daemon offline" asChild>
	<Providers harnesses={null} active={[]} />
</Story>
