<script lang="ts">
	import { persisted } from '#lib/persisted.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Composer from '#lib/ui/Composer.svelte';
	import Select from '#lib/ui/Select.svelte';
	import { createWorkspace, getHarnesses } from '../../../routes/workspaces.remote';
	import HarnessPicker, { resolveChoice, type HarnessChoice } from './HarnessPicker.svelte';

	type Props = {
		/** The repositories to choose from. With just one, there is nothing to choose. */
		repos: { id: string; name: string }[];
		/** The repository picked to begin with; the first one, unless said otherwise. */
		preferred?: string;
		label?: string;
	};
	let { repos, preferred, label }: Props = $props();

	const { repoId, agent, model, effort, prompt } = createWorkspace.fields;
	/** The repository picked here, if one was; otherwise the preferred one, or the first. */
	let picked = $state<string>();
	const repo = $derived(
		repos.find((repo) => repo.id === picked) ??
			repos.find((repo) => repo.id === preferred) ??
			repos[0]
	);

	const harnesses = $derived(await getHarnesses());
	// The next workspace starts out the way the last one was set up.
	const choice = persisted<HarnessChoice>('geordi:harness', { agent: 'claude', settings: {} });
	const chosen = $derived(resolveChoice(harnesses, choice.current));
</script>

<!-- Where a workspace begins: say what should be done, pick who does it, how, and where. -->
<Composer
	form={createWorkspace}
	{label}
	placeholder="What should the agent do?"
	field={prompt.as('text')}
	problems={prompt.issues()?.map((problem) => problem.message)}
>
	{#snippet header()}
		<input {...repoId.as('hidden', repo?.id ?? '')} />
		<input {...agent.as('hidden', chosen.harness.agent)} />
		<!-- empty leaves it to the agent's CLI -->
		<input {...model.as('hidden', chosen.model?.id ?? '')} />
		<input {...effort.as('hidden', chosen.effort ?? '')} />
	{/snippet}
	{#snippet footer()}
		<!-- where, who, how hard: three quiet choices -->
		<div class="flex min-w-0 flex-wrap items-center gap-1">
			{#if repos.length > 1}
				<Select
					label="Repository"
					options={repos.map((repo) => ({ value: repo.id, label: repo.name }))}
					bind:value={() => repo.id, (id) => (picked = id)}
				>
					{#snippet trigger()}
						<span class="icon-[lucide--folder-git-2] size-4 shrink-0"></span>
						<span class="truncate text-ink">{repo.name}</span>
					{/snippet}
				</Select>
			{/if}
			<HarnessPicker
				{harnesses}
				choice={choice.current}
				onchange={(next) => (choice.current = next)}
			/>
		</div>
		<Button type="submit" variant="primary" icon="icon-[lucide--arrow-up]" class="ml-auto">
			Start workspace
		</Button>
	{/snippet}
</Composer>
