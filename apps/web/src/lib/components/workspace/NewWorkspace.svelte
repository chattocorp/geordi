<script lang="ts">
	import { persisted } from '#lib/persisted.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Composer from '#lib/ui/Composer.svelte';
	import { createWorkspace, getHarnesses } from '../../../routes/workspaces.remote';
	import HarnessPicker, { resolveChoice, type HarnessChoice } from './HarnessPicker.svelte';
	import RepoPicker from './RepoPicker.svelte';

	type Props = {
		/** The repositories to choose from. With just one, there is nothing to choose. */
		repos: { id: string; name: string }[];
		/** The repository picked to begin with; the first one, unless said otherwise. */
		preferred?: string;
		label?: string;
	};
	let { repos, preferred, label }: Props = $props();

	const { repoId, agent, model, effort, prompt } = createWorkspace.fields;
	const first = $derived(repos.find((repo) => repo.id === preferred)?.id ?? repos[0]?.id);

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
		{#if repos.length === 1}<input {...repoId.as('hidden', repos[0].id)} />{/if}
		<input {...agent.as('hidden', chosen.harness.agent)} />
		<!-- empty leaves it to the agent's CLI -->
		<input {...model.as('hidden', chosen.model?.id ?? '')} />
		<input {...effort.as('hidden', chosen.effort ?? '')} />
	{/snippet}
	{#snippet footer()}
		<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
			{#if repos.length > 1}
				<RepoPicker {repos} attributes={(id) => repoId.as('radio', id, id === first)} />
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
