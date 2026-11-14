<script lang="ts">
	import Button from '#lib/ui/Button.svelte';
	import Composer from '#lib/ui/Composer.svelte';
	import { createWorkspace } from '../../../routes/workspaces.remote';
	import AgentPicker from './AgentPicker.svelte';
	import RepoPicker from './RepoPicker.svelte';

	type Props = {
		/** The repositories to choose from. With just one, there is nothing to choose. */
		repos: { id: string; name: string }[];
		/** The repository picked to begin with; the first one, unless said otherwise. */
		preferred?: string;
		label?: string;
	};
	let { repos, preferred, label }: Props = $props();

	const { repoId, agent, prompt } = createWorkspace.fields;
	const first = $derived(repos.find((repo) => repo.id === preferred)?.id ?? repos[0]?.id);
</script>

<!-- Where a workspace begins: say what should be done, pick who does it and where. -->
<Composer
	form={createWorkspace}
	{label}
	placeholder="What should the agent do?"
	field={prompt.as('text')}
	problems={prompt.issues()?.map((problem) => problem.message)}
>
	{#snippet header()}
		{#if repos.length === 1}<input {...repoId.as('hidden', repos[0].id)} />{/if}
	{/snippet}
	{#snippet footer()}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			{#if repos.length > 1}
				<RepoPicker {repos} attributes={(id) => repoId.as('radio', id, id === first)} />
			{/if}
			<AgentPicker attributes={(name) => agent.as('radio', name, name === 'claude')} />
		</div>
		<Button type="submit" variant="primary" icon="icon-[lucide--arrow-up]" class="ml-auto">
			Start workspace
		</Button>
	{/snippet}
</Composer>
