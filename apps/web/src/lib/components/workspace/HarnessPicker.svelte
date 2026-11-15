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
	import Select from '#lib/ui/Select.svelte';

	type Props = {
		/** What each agent can be asked to run. */
		harnesses: Harness[];
		choice: HarnessChoice;
		onchange(choice: HarnessChoice): void;
	};
	let { harnesses, choice, onchange }: Props = $props();

	const { harness, model, efforts, effort } = $derived(resolveChoice(harnesses, choice));

	const set = (settings: AgentSettings) =>
		onchange({
			...choice,
			settings: { ...choice.settings, [harness.agent]: { model: model?.id, effort, ...settings } }
		});
</script>

<!-- Who does the work, with which model, thinking how hard. -->
<div class="flex flex-wrap items-center gap-1.5">
	<div role="group" aria-label="Agent" class="flex gap-1.5">
		{#each harnesses as { agent } (agent)}
			<button
				type="button"
				class="choice"
				aria-pressed={agent === harness.agent}
				onclick={() => onchange({ ...choice, agent })}
			>
				<AgentAvatar {agent} size="sm" />
				{agentName[agent]}
			</button>
		{/each}
	</div>

	{#if harness?.models.length}
		<Select
			label="Model"
			options={[
				{ value: '', label: 'Default model' },
				...harness.models.map((model) => ({
					value: model.id,
					label: model.name,
					// the name the CLI knows it by, where that says more than the label
					hint: model.id.toLowerCase() === model.name.toLowerCase() ? undefined : model.id
				}))
			]}
			bind:value={() => model?.id ?? '', (id) => set({ model: id || undefined })}
		/>
	{/if}

	{#if efforts.length}
		<Select
			label="Effort"
			options={[
				{ value: '', label: 'Default effort' },
				...efforts.map((effort) => ({ value: effort, label: effortName(effort) }))
			]}
			bind:value={() => effort ?? '', (level) => set({ effort: level || undefined })}
		>
			{#snippet leading()}
				<!-- a meter: as many bars lit as the effort is high -->
				<span class="flex h-3.5 items-end gap-0.5" aria-hidden="true">
					{#each efforts as level, index (level)}
						<span
							class={[
								'w-0.5 rounded-full',
								effort && index <= efforts.indexOf(effort) ? 'bg-ink' : 'bg-muted/40'
							]}
							style:height="{((index + 1) / efforts.length) * 100}%"
						></span>
					{/each}
				</span>
			{/snippet}
		</Select>
	{/if}
</div>
