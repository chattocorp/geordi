<script lang="ts" module>
	import {
		DEFAULT_PERMISSION_MODE,
		MODEL_SETTING,
		type Agent,
		type AgentSettings,
		type PermissionMode,
		type SessionModel,
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
	export function resolveChoice(
		harnesses: Harness[],
		choice: HarnessChoice,
		sessionModel?: SessionModel
	) {
		const harness = harnesses.find((harness) => harness.agent === choice.agent) ?? harnesses[0];
		const wanted = choice.settings[harness?.agent] ?? {};
		const model =
			harness?.models.find((model) => model.id === wanted.model) ??
			(wanted.named && wanted.model && MODEL_SETTING.test(wanted.model)
				? { id: wanted.model, name: wanted.model, efforts: harness.efforts }
				: harness?.agent === 'opencode'
					? undefined
					: harness?.models[0]);
		const reported =
			harness?.agent === 'opencode' && sessionModel?.requested.model === wanted.model
				? sessionModel
				: undefined;
		const resolvedModel = reported?.model
			? harness?.models.find((m) => m.id === reported.model)
			: undefined;
		const efforts = model?.efforts ?? resolvedModel?.efforts ?? harness?.efforts ?? [];
		const effort = efforts.find((effort) => effort === wanted.effort);
		return {
			harness,
			model,
			reported,
			resolvedModel,
			efforts,
			effort,
			permissionMode: wanted.permissionMode ?? DEFAULT_PERMISSION_MODE
		};
	}
</script>

<script lang="ts">
	import AgentAvatar from '@geordi/ui/AgentAvatar.svelte';
	import { agentName } from '#lib/format.ts';
	import { effortShortcut, modelShortcut } from '@geordi/ui/keys';
	import Select, { type SelectOption } from '#lib/ui/Select.svelte';
	import Battery from '#lib/components/Battery.svelte';
	import { charge } from '#lib/limits.ts';
	import type { Limits } from '#lib/server/limits.ts';

	type Props = {
		/** What each agent can be asked to run. */
		harnesses: Harness[];
		choice: HarnessChoice;
		sessionModel?: SessionModel;
		/** What each agent's usage limits leave, shown beside its models. */
		limits?: Limits;
		onchange(choice: HarnessChoice): void;
	};
	let { harnesses, choice, sessionModel, limits = {}, onchange }: Props = $props();

	const { harness, model, reported, resolvedModel, efforts, effort, permissionMode } = $derived(
		resolveChoice(harnesses, choice, sessionModel)
	);

	const reportedEffort = $derived(
		reported?.requested.effort === effort ? reported?.effort : undefined
	);
	const defaultModel = $derived(
		reported?.model && !model
			? 'OpenCode default · ' + (resolvedModel?.name ?? reported.model)
			: 'OpenCode'
	);
	const defaultEffort = $derived(
		reportedEffort ? 'Default · ' + effortName(reportedEffort) : 'Default effort'
	);

	// One list of everything that can do the work: every agent's models. An agent that names
	// none is there itself.
	const SEPARATOR = '/';
	const options = $derived(
		harnesses.flatMap(({ agent, models }): SelectOption[] => {
			// the chosen model is in the list even if it was typed in
			const all =
				agent === harness.agent && model && !models.includes(model) ? [...models, model] : models;
			const byName = Object.groupBy(all, (item) => item.name);
			const entries = all.map((model) => ({
				value: agent + SEPARATOR + model.id,
				label: (byName[model.name]?.length ?? 0) > 1 ? `${model.name} (${model.id})` : model.name,
				keywords: `${agentName[agent]} ${model.id}`
			}));
			if (agent === 'opencode' || !entries.length)
				return [
					{
						value: agent + SEPARATOR,
						label: agent === 'opencode' ? defaultModel : agentName[agent]
					},
					...entries
				];
			return entries;
		})
	);

	/** A model by a name we don't know (a specific version, say), for each agent to try. */
	const named = (typed: string): SelectOption[] =>
		MODEL_SETTING.test(typed)
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
		const separator = value.indexOf(SEPARATOR);
		const agent = value.slice(0, separator) as Agent;
		const id = value.slice(separator + 1);
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
		<!-- the tile sits as far from the button's left edge as from its top and bottom -->
		<span class="-ml-1 flex"><AgentAvatar agent={harness.agent} size="sm" /></span>
		<span class="truncate text-ink">
			{model?.name ?? (harness.agent === 'opencode' ? defaultModel : agentName[harness.agent])}
		</span>
	{/snippet}
	{#snippet icon(option)}
		<AgentAvatar agent={agentOf(option)} size="sm" />
	{/snippet}
	{#snippet aside(option)}
		{@const agent = agentOf(option)}
		<!-- by its label, for the limits that hold for one model alone (`Week (Opus)`) -->
		{@const battery = charge(limits[agent] ?? [], option.label)}
		{#if battery}<Battery
				left={battery.left}
				tone={battery.tone}
				label="{agentName[agent]} usage: {Math.round(battery.left * 100)}% left"
			/>{/if}
	{/snippet}
</Select>

{#if efforts.length}
	<Select
		label="Reasoning effort"
		shortcut={effortShortcut}
		options={[
			{ value: '', label: defaultEffort },
			...efforts.map((effort) => ({ value: effort, label: effortName(effort) }))
		]}
		bind:value={() => effort ?? '', (level) => set(harness.agent, { effort: level || undefined })}
	>
		{#snippet trigger()}
			{#if effort}<span class="text-ink">{effortName(effort)}</span>{:else}{reportedEffort
					? defaultEffort
					: 'Effort'}{/if}
		{/snippet}
	</Select>
{:else if reportedEffort}
	<span class="text-sm text-muted">{effortName(reportedEffort)} effort</span>
{/if}

<Select
	label="Permission mode"
	options={[
		{ value: 'auto', label: harness.agent === 'opencode' ? 'Configured permissions' : 'Auto Mode' },
		{ value: 'sandboxed', label: 'Full Permissions (Sandboxed)' },
		{ value: 'full-access', label: 'Full Permissions' }
	] satisfies SelectOption<PermissionMode>[]}
	bind:value={() => permissionMode, (value) => set(harness.agent, { permissionMode: value })}
>
	{#snippet icon(option)}
		<span
			aria-hidden="true"
			class={[
				'size-4 shrink-0',
				{
					auto: 'icon-[lucide--radar]',
					sandboxed: 'icon-[lucide--shield-check]',
					'full-access': 'icon-[lucide--key-round]'
				}[option.value]
			]}
		></span>
	{/snippet}
</Select>
