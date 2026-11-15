<script lang="ts" module>
	import type { Agent, AgentSettings, Harness } from '@geordi/protocol';

	/** Who should do the work, and how each agent was last set up. */
	export type HarnessChoice = { agent: Agent; settings: Partial<Record<Agent, AgentSettings>> };

	const EFFORT_NAMES: Record<string, string> = { xhigh: 'Extra high' };
	export const effortName = (effort: string) =>
		EFFORT_NAMES[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);

	/**
	 * What a choice comes to, given what is on offer now. What was chosen before may be gone
	 * (another daemon, a CLI update): then it is back to the agent's own default.
	 */
	export function resolveChoice(harnesses: Harness[], choice: HarnessChoice) {
		const harness = harnesses.find((harness) => harness.agent === choice.agent) ?? harnesses[0];
		const wanted = choice.settings[harness?.agent] ?? {};
		const model = harness?.models.find((model) => model.id === wanted.model);
		const efforts = model?.efforts ?? harness?.efforts ?? [];
		const effort = efforts.find((effort) => effort === wanted.effort);
		return { harness, model, efforts, effort };
	}
</script>

<script lang="ts">
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import { agentName } from '#lib/format.ts';
	import Select, { type SelectOption } from '#lib/ui/Select.svelte';
	import Steps from '#lib/ui/Steps.svelte';

	type Props = {
		/** What each agent can be asked to run. */
		harnesses: Harness[];
		choice: HarnessChoice;
		onchange(choice: HarnessChoice): void;
	};
	let { harnesses, choice, onchange }: Props = $props();

	const { harness, model, efforts, effort } = $derived(resolveChoice(harnesses, choice));

	// One list of everything that can do the work: each agent as it is set up, and its models.
	const SEPARATOR = '/';
	const options = $derived(
		harnesses.flatMap(({ agent, models }): SelectOption[] => [
			{ value: agent + SEPARATOR, label: agentName[agent] },
			...models.map((model) => ({
				value: agent + SEPARATOR + model.id,
				label: model.name,
				keywords: `${agentName[agent]} ${model.id}`
			}))
		])
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
	Who does the work, with which model, thinking how hard: one quiet line that opens a list.
	An agent's own entry leaves the model to its CLI.
-->
<Select
	label="Agent and model"
	{options}
	bind:value={() => harness.agent + SEPARATOR + (model?.id ?? ''), pick}
>
	{#snippet trigger()}
		<AgentAvatar agent={harness.agent} size="sm" />
		<span class="truncate text-ink">{model?.name ?? agentName[harness.agent]}</span>
		{#if effort}<span class="shrink-0">{effortName(effort)}</span>{/if}
	{/snippet}
	{#snippet icon(option)}
		<AgentAvatar agent={agentOf(option)} size="sm" />
	{/snippet}
	{#snippet footer()}
		{#if efforts.length}
			<div class="flex items-center gap-2 px-2 py-1.5 text-sm">
				<span class="flex-1">Effort</span>
				<span class="text-muted">{effort ? effortName(effort) : 'Default'}</span>
				<Steps
					label="Reasoning effort"
					steps={[
						{ value: '', label: 'Default' },
						...efforts.map((effort) => ({ value: effort, label: effortName(effort) }))
					]}
					bind:value={
						() => effort ?? '', (level) => set(harness.agent, { effort: level || undefined })
					}
				/>
			</div>
		{/if}
	{/snippet}
</Select>
