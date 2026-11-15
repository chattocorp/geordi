<script lang="ts">
	import { submitOnEnter } from '#lib/keys.ts';
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

	// `undefined` until loaded, `null` while no daemon is connected: nothing to choose from
	const offered = getHarnesses();
	const harnesses = $derived(offered.current);
	// The next workspace starts out the way the last one was set up.
	const choice = persisted<HarnessChoice>('geordi:harness', { agent: 'claude', settings: {} });
	const chosen = $derived(harnesses ? resolveChoice(harnesses, choice.current) : null);
</script>

<!-- Where a workspace begins: say what should be done, pick who does it, how, and where. -->
<Composer
	form={createWorkspace}
	{label}
	placeholder="What should the agent do?"
	field={prompt.as('text')}
	onkeydown={(event) => {
		// Enter starts the workspace, but not while there is no daemon to run it
		if (harnesses) submitOnEnter(event);
		else if (event.key === 'Enter' && !event.shiftKey) event.preventDefault();
	}}
	problems={prompt.issues()?.map((problem) => problem.message)}
>
	{#snippet header()}
		<input {...repoId.as('hidden', repo?.id ?? '')} />
		<input {...agent.as('hidden', chosen?.harness.agent ?? choice.current.agent)} />
		<!-- empty leaves it to the agent's CLI -->
		<input {...model.as('hidden', chosen?.model?.id ?? '')} />
		<input {...effort.as('hidden', chosen?.effort ?? '')} />
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
			{#if harnesses}
				<HarnessPicker
					{harnesses}
					choice={choice.current}
					onchange={(next) => (choice.current = next)}
				/>
			{:else if harnesses === null}
				<!-- agents run on a daemon: without one there is nobody to choose -->
				<span class="flex h-8 items-center gap-1.5 px-2 text-sm text-muted">
					<span class="icon-[lucide--unplug] size-3.5"></span>
					Waiting for the daemon
				</span>
			{/if}
		</div>
		<Button
			type="submit"
			variant="primary"
			icon="icon-[lucide--arrow-up]"
			class="ml-auto"
			disabled={!harnesses}
		>
			Start workspace
		</Button>
	{/snippet}
</Composer>
