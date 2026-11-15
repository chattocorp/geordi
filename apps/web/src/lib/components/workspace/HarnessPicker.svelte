<script lang="ts" module>
	import type { Agent, AgentSettings, Harness } from '@geordi/protocol';

	/** Who should do the work, and how each agent was last set up. */
	export type HarnessChoice = { agent: Agent; settings: Partial<Record<Agent, AgentSettings>> };

	const EFFORT_NAMES: Record<string, string> = { xhigh: 'Extra high' };
	export const effortName = (effort: string) =>
		EFFORT_NAMES[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);

	/**
	 * What a choice comes to, given what is on offer now. What was chosen before may be gone
	 * (another daemon, a CLI update): then it is the agent's first model, and its own effort.
	 * An agent that names no models has none to choose: its CLI decides.
	 */
	export function resolveChoice(harnesses: Harness[], choice: HarnessChoice) {
		const harness = harnesses.find((harness) => harness.agent === choice.agent) ?? harnesses[0];
		const wanted = choice.settings[harness?.agent] ?? {};
		const model = harness?.models.find((model) => model.id === wanted.model) ?? harness?.models[0];
		const efforts = model?.efforts ?? harness?.efforts ?? [];
		const effort = efforts.find((effort) => effort === wanted.effort);
		return { harness, model, efforts, effort };
	}
</script>

<script lang="ts">
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import { agentName } from '#lib/format.ts';
	import Select, { type SelectOption } from '#lib/ui/Select.svelte';

	type Props = {
		/** What each agent can be asked to run. */
		harnesses: Harness[];
		choice: HarnessChoice;
		onchange(choice: HarnessChoice): void;
	};
	let { harnesses, choice, onchange }: Props = $props();

	const { harness, model, efforts, effort } = $derived(resolveChoice(harnesses, choice));

	// One list of everything that can do the work: every agent's models. An agent that names
	// none is there itself.
	const SEPARATOR = '/';
	const options = $derived(
		harnesses.flatMap(({ agent, models }): SelectOption[] =>
			models.length === 0
				? [{ value: agent + SEPARATOR, label: agentName[agent] }]
				: models.map((model) => ({
						value: agent + SEPARATOR + model.id,
						label: model.name,
						keywords: `${agentName[agent]} ${model.id}`
					}))
		)
	);
	const agentOf = (option: SelectOption) => option.value.split(SEPARATOR)[0] as Agent;

	const set = (agent: Agent, settings: AgentSettings) =>
		onchange({
			agent,
			settings: { ...choice.settings, [agent]: { ...choice.settings[agent], ...settings } }
		});

	function pick(value: string) {
		const [agent, id] = value.split(SEPARATOR) as [Agent, string];
		set(agent, { model: id || undefined });
	}
</script>

<!--
	Who does the work, and how hard it thinks: two quiet choices. The effort levels are those
	of the model chosen; they differ.
-->
<Select
	label="Model"
	{options}
	bind:value={() => harness.agent + SEPARATOR + (model?.id ?? ''), pick}
>
	{#snippet trigger()}
		<AgentAvatar agent={harness.agent} size="sm" />
		<span class="truncate text-ink">{model?.name ?? agentName[harness.agent]}</span>
	{/snippet}
	{#snippet icon(option)}
		<AgentAvatar agent={agentOf(option)} size="sm" />
	{/snippet}
</Select>

{#if efforts.length}
	<Select
		label="Reasoning effort"
		options={[
			{ value: '', label: 'Default effort' },
			...efforts.map((effort) => ({ value: effort, label: effortName(effort) }))
		]}
		bind:value={() => effort ?? '', (level) => set(harness.agent, { effort: level || undefined })}
	>
		{#snippet trigger()}
			{#if effort}<span class="text-ink">{effortName(effort)}</span>{:else}Effort{/if}
		{/snippet}
	</Select>
{/if}
