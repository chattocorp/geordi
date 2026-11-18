<script lang="ts" module>
	import {
		SETTING,
		type Agent,
		type AgentSettings,
		type PermissionMode,
		type Harness
	} from '@geordi/protocol';

	/**
	 * Who should do the work, and how each agent was last set up. `named` marks a model that
	 * was typed in rather than picked from the agent's list.
	 */
	export type HarnessChoice = {
		agent: Agent;
		settings: Partial<Record<Agent, AgentSettings & { named?: boolean }>>;
	};

	const EFFORT_NAMES: Record<string, string> = { xhigh: 'Extra high' };
	const effortName = (effort: string) =>
		EFFORT_NAMES[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);

	/**
	 * What a choice comes to, given what is on offer now. What was chosen before may be gone
	 * (another daemon, a CLI update): then it is the agent's first model, and its own effort.
	 * An agent that names no models has none to choose: its CLI decides. A model that was
	 * typed in is taken as it is: only the agent's CLI knows whether it exists.
	 */
	export function resolveChoice(harnesses: Harness[], choice: HarnessChoice) {
		const harness = harnesses.find((harness) => harness.agent === choice.agent) ?? harnesses[0];
		const wanted = choice.settings[harness?.agent] ?? {};
		const model =
			harness?.models.find((model) => model.id === wanted.model) ??
			(wanted.named && wanted.model && SETTING.test(wanted.model)
				? { id: wanted.model, name: wanted.model, efforts: harness.efforts }
				: harness?.models[0]);
		const efforts = model?.efforts ?? harness?.efforts ?? [];
		const effort = efforts.find((effort) => effort === wanted.effort);
		return {
			harness,
			model,
			efforts,
			effort,
			permissionMode: wanted.permissionMode ?? 'full-access'
		};
	}
</script>

<script lang="ts">
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import { agentName } from '#lib/format.ts';
	import { effortShortcut, modelShortcut } from '#lib/keys.ts';
	import Select, { type SelectOption } from '#lib/ui/Select.svelte';

	type Props = {
		/** What each agent can be asked to run. */
		harnesses: Harness[];
		choice: HarnessChoice;
		onchange(choice: HarnessChoice): void;
	};
	let { harnesses, choice, onchange }: Props = $props();

	const { harness, model, efforts, effort, permissionMode } = $derived(
		resolveChoice(harnesses, choice)
	);

	// One list of everything that can do the work: every agent's models. An agent that names
	// none is there itself.
	const SEPARATOR = '/';
	const options = $derived(
		harnesses.flatMap(({ agent, models }): SelectOption[] => {
			// the chosen model is in the list even if it was typed in
			const all =
				agent === harness.agent && model && !models.includes(model) ? [...models, model] : models;
			return all.length === 0
				? [{ value: agent + SEPARATOR, label: agentName[agent] }]
				: all.map((model) => ({
						value: agent + SEPARATOR + model.id,
						label: model.name,
						keywords: `${agentName[agent]} ${model.id}`
					}));
		})
	);

	/** A model by a name we don't know (a specific version, say), for each agent to try. */
	const named = (typed: string): SelectOption[] =>
		SETTING.test(typed)
			? harnesses.map(({ agent }) => ({
					value: agent + SEPARATOR + typed,
					label: `Use “${typed}” with ${agentName[agent]}`
				}))
			: [];
	const agentOf = (option: SelectOption) => option.value.split(SEPARATOR)[0] as Agent;

	const set = (agent: Agent, settings: HarnessChoice['settings'][Agent]) =>
		onchange({
			agent,
			settings: { ...choice.settings, [agent]: { ...choice.settings[agent], ...settings } }
		});

	function pick(value: string) {
		const [agent, id] = value.split(SEPARATOR) as [Agent, string];
		const listed = harnesses.find((h) => h.agent === agent)?.models.some((m) => m.id === id);
		set(agent, { model: id || undefined, named: !!id && !listed });
	}
</script>

<Select
	label="Model"
	shortcut={modelShortcut}
	{options}
	create={named}
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
		shortcut={effortShortcut}
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

<Select
	label="Permission mode"
	options={[
		{ value: 'auto', label: 'Auto Mode' },
		{ value: 'full-access', label: 'Full Access' }
	] satisfies SelectOption<PermissionMode>[]}
	bind:value={() => permissionMode, (value) => set(harness.agent, { permissionMode: value })}
>
	{#snippet icon(option)}
		<span
			aria-hidden="true"
			class={[
				'size-4 shrink-0',
				option.value === 'auto' ? 'icon-[lucide--radar]' : 'icon-[lucide--key-round]'
			]}
		></span>
	{/snippet}
</Select>
