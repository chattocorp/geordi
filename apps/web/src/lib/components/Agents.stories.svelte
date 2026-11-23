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
		{
			agent: 'opencode',
			models: [
				{ id: 'opencode/big-pickle', name: 'Big Pickle', efforts: [] },
				{
					id: 'opencode/beam-free',
					name: 'Beam Free',
					efforts: ['low', 'medium', 'high', 'xhigh', 'max']
				}
			],
			efforts: []
		}
	];
</script>

<script lang="ts">
	let defaultChoice = $state<HarnessChoice>({ agent: 'opencode', settings: {} });
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
		<AgentAvatar agent="opencode" size="sm" />
	</div>
</Story>

<Story name="Picker" asChild>
	<HarnessPicker {harnesses} {choice} onchange={(next) => (choice = next)} />
</Story>

<!-- each agent's models with what its usage limits leave (open the list to see them) -->
<Story name="Picker with usage" asChild>
	<HarnessPicker
		{harnesses}
		{choice}
		limits={{
			claude: [
				{ name: '5h', minutes: 300, usedPercent: 35, status: 'ok' },
				{ name: 'Week', minutes: 10080, usedPercent: 50, status: 'ok' }
			],
			codex: [{ name: '5h', minutes: 300, usedPercent: 82, status: 'warning' }]
		}}
		onchange={(next) => (choice = next)}
	/>
</Story>

<Story name="Reported OpenCode defaults" asChild>
	<HarnessPicker
		{harnesses}
		choice={defaultChoice}
		sessionModel={{ requested: {}, model: 'opencode/beam-free', effort: 'low' }}
		onchange={(next) => (defaultChoice = next)}
	/>
</Story>

<Story name="Provider status" asChild>
	<Providers harnesses={[harnesses[0]]} active={['claude']} />
</Story>

<Story name="Daemon offline" asChild>
	<Providers harnesses={null} active={[]} />
</Story>
